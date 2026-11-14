/**
 * =========================================================================
 * WEDDING INVITATION RSVP BACKEND - GOOGLE APPS SCRIPT (Code.gs)
 * =========================================================================
 * Destination: Private Google Sheet
 * 
 * Features:
 * - doPost(e): Validates and sanitizes RSVP submissions; appends row to "RSVPs" sheet.
 * - Idempotency & Deduplication: Tracks submissionId via CacheService (fast path) and Column F lookup (fallback).
 * - Anti-spam: Rejects non-empty honeypot field ("website").
 * - Sanitization: Trims strings, enforces length limits, prevents spreadsheet formula injection (=, +, -, @).
 * - Concurrency: Uses LockService (25s timeout) to prevent race conditions from concurrent guest submissions.
 * - Auto-initialization: Creates sheet and 6-column header row if not present.
 * - Privacy: doGet(e) returns only "OK" text. No sheet contents are ever returned or queryable.
 * - Structured response contract: { ok, code, retryable, message, duplicate?, error? }
 */

var SHEET_NAME = 'RSVPs';
var MAX_PAYLOAD_BYTES = 10240; // 10 KB request size cap
var MAX_NAME_LENGTH = 100;
var MAX_MESSAGE_LENGTH = 500;
var VALID_ATTENDANCE = ['Attending', 'Decline'];
var VALID_GUESTS = ['1', '2', '3', '4', '5+'];
var SUBMISSION_ID_REGEX = /^[A-Za-z0-9_-]{8,64}$/;
var LOCK_WAIT_MS = 25000;
var CACHE_TTL_SECONDS = 21600; // 6 hours (Apps Script maximum allowed)

/**
 * Health check / public GET endpoint.
 * Returns only plain "OK" text. Never exposes any stored data or sheet metadata.
 */
function doGet(e) {
  return ContentService.createTextOutput("OK")
    .setMimeType(ContentService.MimeType.TEXT);
}

/**
 * RSVP submission POST handler.
 * Expects JSON payload in e.postData.contents.
 */
function doPost(e) {
  // 1. Guard against missing or empty payload
  if (!e || !e.postData || !e.postData.contents) {
    return createJsonResponse(false, 'VALIDATION', false, 'No data payload received');
  }

  // 2. Reject oversized request bodies (10 KB cap)
  if (e.postData.contents.length > MAX_PAYLOAD_BYTES) {
    return createJsonResponse(false, 'VALIDATION', false, 'Payload exceeds maximum allowed size');
  }

  // 3. Parse JSON body
  var data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return createJsonResponse(false, 'VALIDATION', false, 'Malformed JSON payload');
  }

  // 4. Reject non-object payloads (must be a non-null plain object)
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return createJsonResponse(false, 'VALIDATION', false, 'Invalid payload structure');
  }

  // 5. Honeypot anti-spam check: reject immediately if the hidden "website" field is filled
  if (data.website !== undefined && data.website !== null && String(data.website).trim() !== '') {
    return createJsonResponse(false, 'REJECTED', false, 'Submission rejected');
  }

  // 6. Optional submissionId validation (for deduplication / idempotency)
  // Missing -> allowed (backward compatibility for old frontends without dedupe).
  // Present -> must be string, 8-64 chars, only [A-Za-z0-9_-].
  var submissionId = '';
  if (data.submissionId !== undefined && data.submissionId !== null) {
    if (typeof data.submissionId !== 'string' || !SUBMISSION_ID_REGEX.test(data.submissionId)) {
      return createJsonResponse(false, 'VALIDATION', false, 'Invalid submission ID');
    }
    submissionId = data.submissionId;
  }

  // 7. Type checks and validations
  // 7a. Name (Required string, 1-100 characters)
  if (typeof data.name !== 'string') {
    return createJsonResponse(false, 'VALIDATION', false, 'Name must be a text string');
  }
  var name = data.name.trim();
  if (!name || name.length > MAX_NAME_LENGTH) {
    return createJsonResponse(false, 'VALIDATION', false, 'Name is required and must not exceed 100 characters');
  }

  // 7b. Attendance (Required string: must be exactly "Attending" or "Decline")
  if (typeof data.attendance !== 'string') {
    return createJsonResponse(false, 'VALIDATION', false, 'Attendance must be a text string');
  }
  var attendance = data.attendance.trim();
  if (VALID_ATTENDANCE.indexOf(attendance) === -1) {
    return createJsonResponse(false, 'VALIDATION', false, 'Attendance must be either Attending or Decline');
  }

  // 7c. Guest Count (Required string: must be 1, 2, 3, 4, or 5+)
  if (typeof data.guests !== 'string') {
    return createJsonResponse(false, 'VALIDATION', false, 'Guests must be a text string');
  }
  var guests = data.guests.trim();
  if (VALID_GUESTS.indexOf(guests) === -1) {
    return createJsonResponse(false, 'VALIDATION', false, 'Guests must be one of: 1, 2, 3, 4, 5+');
  }

  // 7d. Message (Optional string, max 500 characters, default if empty)
  var message = '';
  if (data.message !== undefined && data.message !== null) {
    if (typeof data.message !== 'string') {
      return createJsonResponse(false, 'VALIDATION', false, 'Message must be a text string');
    }
    message = data.message.trim();
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return createJsonResponse(false, 'VALIDATION', false, 'Message must not exceed 500 characters');
  }
  if (!message) {
    message = 'Wishing you both a lifetime of love and joy!';
  }

  // 8. Prevent CSV / Spreadsheet Formula Injection
  var safeName = sanitizeFormulaInjection(name);
  var safeAttendance = sanitizeFormulaInjection(attendance);
  var safeGuests = sanitizeFormulaInjection(guests);
  var safeMessage = sanitizeFormulaInjection(message);
  var safeSubmissionId = submissionId ? sanitizeFormulaInjection(submissionId) : '';

  // 9. Format timestamp in Indian Standard Time (IST / GMT+5:30)
  var timestampIST = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'dd/MM/yyyy HH:mm:ss');

  // 10. Concurrency control: LockService ensures concurrent submissions do not overwrite each other
  var lock = LockService.getScriptLock();
  var lockAcquired = false;

  try {
    try {
      lock.waitLock(LOCK_WAIT_MS);
      lockAcquired = true;
    } catch (lockErr) {
      console.error('Lock acquisition timed out after ' + LOCK_WAIT_MS + 'ms: ' + lockErr);
      return createJsonResponse(false, 'BUSY', true, 'Server is busy. Please try submitting again in a moment.');
    }

    // 11. Locked Section: Sheet access, deduplication check, and single write
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = spreadsheet.getSheetByName(SHEET_NAME);

    // Auto-create sheet and headers if missing (6 columns: A-F)
    if (!sheet) {
      sheet = spreadsheet.insertSheet(SHEET_NAME);
      sheet.appendRow(['Timestamp (IST)', 'Name', 'Attendance', 'Guests', 'Message', 'Submission ID']);
      sheet.setFrozenRows(1);

      // Subtle header styling
      var headerRange = sheet.getRange(1, 1, 1, 6);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#f4efe6');
      headerRange.setFontColor('#1a1a1a');
    }

    // Deduplication check inside the lock (only if submissionId was provided)
    var cacheKey = '';
    if (submissionId) {
      cacheKey = 'rsvp:' + submissionId;
      var cache = CacheService.getScriptCache();

      // Fast path: CacheService
      try {
        var cached = cache.get(cacheKey);
        if (cached !== null) {
          return createJsonResponse(true, 'DUPLICATE', false, 'Your RSVP was already received.', true);
        }
      } catch (cacheGetErr) {
        console.error('Cache read error: ' + cacheGetErr);
      }

      // Fallback: Check Column F in the sheet
      var lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        var fValues = sheet.getRange(2, 6, lastRow - 1, 1).getValues();
        for (var i = 0; i < fValues.length; i++) {
          if (fValues[i][0] === submissionId) {
            // Repopulate cache for subsequent retries
            try {
              cache.put(cacheKey, '1', CACHE_TTL_SECONDS);
            } catch (cachePutErr) {
              console.error('Failed to set cache key in fallback: ' + cachePutErr);
            }
            return createJsonResponse(true, 'DUPLICATE', false, 'Your RSVP was already received.', true);
          }
        }
      }
    }

    // Append the validated RSVP record (Columns A-F in one single call)
    sheet.appendRow([timestampIST, safeName, safeAttendance, safeGuests, safeMessage, safeSubmissionId]);

    // Populate fast path cache after successful write
    if (submissionId && cacheKey) {
      try {
        var cachePostWrite = CacheService.getScriptCache();
        cachePostWrite.put(cacheKey, '1', CACHE_TTL_SECONDS);
      } catch (cacheSetErr) {
        console.error('Failed to set cache key after write: ' + cacheSetErr);
      }
    }

    return createJsonResponse(true, 'OK', false, 'Your RSVP has been recorded successfully.');
  } catch (err) {
    console.error('Unexpected server error during sheet write: ' + (err && err.stack ? err.stack : err));
    return createJsonResponse(false, 'SERVER', true, "We couldn't save your RSVP right now. Please try again.");
  } finally {
    if (lockAcquired) {
      try {
        lock.releaseLock();
      } catch (releaseErr) {
        console.error('Failed to release lock: ' + releaseErr);
      }
    }
  }
}

/**
 * Escapes characters that Excel / Google Sheets interpret as formulas (=, +, -, @).
 * Prepends a single quote so the spreadsheet engine treats the cell value as plain text.
 */
function sanitizeFormulaInjection(val) {
  var str = String(val || '');
  if (/^[=+\-@]/.test(str)) {
    return "'" + str;
  }
  return str;
}

/**
 * Helper to produce standard JSON outputs conforming to the response contract:
 * { ok, code, retryable, message, duplicate?, error? }
 */
function createJsonResponse(ok, code, retryable, message, duplicate) {
  var payload = {
    ok: ok,
    code: code,
    retryable: retryable,
    message: message
  };
  if (duplicate !== undefined) {
    payload.duplicate = duplicate;
  }
  if (!ok) {
    // Backward compatibility for older frontends expecting result.error
    payload.error = message;
  }
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Helper function to migrate an existing sheet: ensures cell F1 has the "Submission ID" header.
 * Run this function once manually from the Apps Script editor toolbar if your sheet was created previously.
 */
function ensureSubmissionIdHeader() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    Logger.log('Sheet "' + SHEET_NAME + '" not found.');
    return;
  }
  var cell = sheet.getRange(1, 6);
  var currentVal = cell.getValue();
  if (!currentVal) {
    cell.setValue('Submission ID');
    cell.setFontWeight('bold');
    cell.setBackground('#f4efe6');
    cell.setFontColor('#1a1a1a');
    Logger.log('Header "Submission ID" added to column F (cell F1).');
  } else {
    Logger.log('Column F header already present: ' + currentVal);
  }
}

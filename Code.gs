/**
 * =========================================================================
 * WEDDING INVITATION RSVP BACKEND - GOOGLE APPS SCRIPT (Code.gs)
 * =========================================================================
 * Destination: Private Google Sheet
 * 
 * Features:
 * - doPost(e): Validates and sanitizes RSVP submissions; appends row to "RSVPs" sheet.
 * - Anti-spam: Rejects non-empty honeypot field ("website").
 * - Sanitization: Trims strings, enforces length limits, prevents spreadsheet formula injection (=, +, -, @).
 * - Concurrency: Uses LockService to prevent race conditions from concurrent guest submissions.
 * - Auto-initialization: Creates sheet and header row if not present.
 * - Privacy: doGet(e) returns only "OK" text. No sheet contents are ever returned or queryable.
 */

var SHEET_NAME = 'RSVPs';
var MAX_NAME_LENGTH = 100;
var MAX_MESSAGE_LENGTH = 500;
var VALID_ATTENDANCE = ['Attending', 'Decline'];
var VALID_GUESTS = ['1', '2', '3', '4', '5+'];

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
    return createJsonResponse(false, 'No data payload received');
  }

  // 2. Parse JSON body
  var data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return createJsonResponse(false, 'Malformed JSON payload');
  }

  // 3. Honeypot anti-spam check: reject immediately if the hidden "website" field is filled
  if (data.website && String(data.website).trim() !== '') {
    return createJsonResponse(false, 'Submission rejected');
  }

  // 4. Validate & sanitize Name (Required, 1-100 characters)
  var name = String(data.name || '').trim();
  if (!name || name.length > MAX_NAME_LENGTH) {
    return createJsonResponse(false, 'Name is required and must not exceed 100 characters');
  }

  // 5. Validate Attendance (Required: must be exactly "Attending" or "Decline")
  var attendance = String(data.attendance || '').trim();
  if (VALID_ATTENDANCE.indexOf(attendance) === -1) {
    return createJsonResponse(false, 'Attendance must be either Attending or Decline');
  }

  // 6. Validate Guest Count (Required: must be 1, 2, 3, 4, or 5+)
  var guests = String(data.guests || '').trim();
  if (VALID_GUESTS.indexOf(guests) === -1) {
    return createJsonResponse(false, 'Guests must be one of: 1, 2, 3, 4, 5+');
  }

  // 7. Validate & sanitize Message (Optional, max 500 characters)
  var message = String(data.message || '').trim();
  if (message.length > MAX_MESSAGE_LENGTH) {
    return createJsonResponse(false, 'Message must not exceed 500 characters');
  }
  if (!message) {
    message = 'Wishing you both a lifetime of love and joy!';
  }

  // 8. Prevent CSV / Spreadsheet Formula Injection:
  // If any text starts with =, +, -, or @, prefix with a single quote (') so Excel/Sheets treat it as literal text
  var safeName = sanitizeFormulaInjection(name);
  var safeAttendance = sanitizeFormulaInjection(attendance);
  var safeGuests = sanitizeFormulaInjection(guests);
  var safeMessage = sanitizeFormulaInjection(message);

  // 9. Format timestamp in Indian Standard Time (IST / GMT+5:30)
  var timestampIST = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'dd/MM/yyyy HH:mm:ss');

  // 10. Concurrency control: LockService ensures concurrent submissions do not overwrite each other
  var lock = LockService.getScriptLock();
  try {
    // Wait up to 10 seconds for concurrent write locks to clear
    lock.waitLock(10000);
  } catch (lockErr) {
    return createJsonResponse(false, 'Server is busy. Please try submitting again in a moment.');
  }

  try {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = spreadsheet.getSheetByName(SHEET_NAME);

    // Auto-create sheet and headers if missing
    if (!sheet) {
      sheet = spreadsheet.insertSheet(SHEET_NAME);
      sheet.appendRow(['Timestamp (IST)', 'Name', 'Attendance', 'Guests', 'Message']);
      sheet.setFrozenRows(1);

      // Subtle header styling
      var headerRange = sheet.getRange(1, 1, 1, 5);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#f4efe6');
      headerRange.setFontColor('#1a1a1a');
    }

    // Append the validated RSVP record
    sheet.appendRow([timestampIST, safeName, safeAttendance, safeGuests, safeMessage]);

    return createJsonResponse(true, null);
  } catch (err) {
    return createJsonResponse(false, 'Spreadsheet write failed: ' + err.toString());
  } finally {
    lock.releaseLock();
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
 * Helper to produce standard JSON outputs.
 */
function createJsonResponse(ok, error) {
  var payload = { ok: ok };
  if (!ok && error) {
    payload.error = error;
  }
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}


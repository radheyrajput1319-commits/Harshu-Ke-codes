class Employee:
    def __init__(self,role,dept,salary):
        self.role = role
        self.dept = dept
        self.salary = salary
    def showDetails(self):
        print("Role is : ",self.role)
        print("Department is : ",self.dept)
        print("Salary is : ",self.salary)
class Engineer(Employee):
    def __init__(self,name,age):
        self.name = name
        self.age = age
        super().__init__(input("Enter Role of Employee: "), input("Enter Department: "), input("Enter Salary: "))
    def shoWDetails(self):
        print("Name : ",self.name)
        print("Age : ",self.age)
        super().showDetails()        
e1 = Engineer(input("Enter Name: "), input("Enter Age: "))
e1.shoWDetails()
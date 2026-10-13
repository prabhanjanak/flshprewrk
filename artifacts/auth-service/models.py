from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float, ForeignKey, JSON
from sqlalchemy.orm import relationship
from database import Base
import datetime

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    address = Column(String, nullable=True)
    joining_date = Column(DateTime, nullable=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False)
    emp_id = Column(String, nullable=True)
    unit = Column(String, nullable=True)
    specialization = Column(String, nullable=True)

class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    address = Column(String, nullable=True)
    joining_date = Column(DateTime, nullable=True)
    email = Column(String, unique=True, index=True, nullable=False)
    phone = Column(String, nullable=True)
    dob = Column(DateTime, nullable=True)
    specialization = Column(String, nullable=True)
    preferred_units = Column(JSON, nullable=True)
    status = Column(String, nullable=True)
    lor1 = Column(String, nullable=True)
    lor2 = Column(String, nullable=True)
    payment_proof = Column(String, nullable=True)
    photo = Column(String, nullable=True)
    application_pdf = Column(String, nullable=True)
    psychometric_pdf = Column(String, nullable=True)
    psychometric_score = Column(Float, nullable=True)
    psychometric_recommendation = Column(String, nullable=True)
    mcq_total = Column(Float, nullable=True)
    mcq_marks = Column(Float, nullable=True)
    interview_avg = Column(Float, nullable=True)
    final_score = Column(Float, nullable=True)
    allocated_unit = Column(String, nullable=True)
    allocated_doctor = Column(String, nullable=True)

class Doctor(Base):
    __tablename__ = "doctors"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    address = Column(String, nullable=True)
    joining_date = Column(DateTime, nullable=True)
    email = Column(String, unique=True, index=True, nullable=False)
    emp_id = Column(String, nullable=True)
    unit = Column(String, nullable=True)
    specializations = Column(JSON, nullable=True)

class Panel(Base):
    __tablename__ = "panels"

    id = Column(Integer, primary_key=True, index=True)
    specialization = Column(String, nullable=True)
    room = Column(String, nullable=True)
    time = Column(DateTime, nullable=True)

class PanelDoctor(Base):
    __tablename__ = "panel_doctors"

    panel_id = Column(Integer, ForeignKey("panels.id"), primary_key=True)
    doctor_id = Column(Integer, ForeignKey("doctors.id"), primary_key=True)

class StudentPanelMap(Base):
    __tablename__ = "student_panel_map"

    student_id = Column(Integer, ForeignKey("students.id"), primary_key=True)
    panel_id = Column(Integer, ForeignKey("panels.id"), primary_key=True)
    status = Column(String, nullable=True)

class Mark(Base):
    __tablename__ = "marks"

    student_id = Column(Integer, ForeignKey("students.id"), primary_key=True)
    doctor_id = Column(Integer, ForeignKey("doctors.id"), primary_key=True)
    marks = Column(Float, nullable=True)
    remarks = Column(String, nullable=True)


class SeatMatrix(Base):
    __tablename__ = "seat_matrix"

    id = Column(Integer, primary_key=True, index=True)
    unit = Column(String, nullable=False)
    specialization = Column(String, nullable=False)
    seats = Column(Integer, nullable=False)


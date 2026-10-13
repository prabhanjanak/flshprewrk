from typing import List
from fastapi import FastAPI, HTTPException, Depends, Security, File, UploadFile
from fastapi.security import OAuth2PasswordBearer
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import psycopg2
from psycopg2.extras import DictCursor
import os
from passlib.context import CryptContext
from jose import jwt, JWTError
from datetime import datetime, timedelta
from database import get_db as get_sqlalchemy_db
from sqlalchemy.orm import Session
import services.sheets_sync as sheets_sync

import shutil

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.staticfiles import StaticFiles
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

import routes.offer_letter
app.include_router(routes.offer_letter.router)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
SECRET_KEY = os.getenv("SESSION_SECRET", "dev-secret-change-me")
ALGORITHM = "HS256"
DATABASE_URL = os.getenv("DATABASE_URL")

def get_db():
    if not DATABASE_URL:
        raise HTTPException(status_code=500, detail="DATABASE_URL not set")
    conn = psycopg2.connect(DATABASE_URL)
    try:
        yield conn
    finally:
        conn.close()

class LoginRequest(BaseModel):
    email: str
    password: str

class ResetRequest(BaseModel):
    email: str
    old_password: str
    new_password: str

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=30)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

@app.post("/auth/login")
def login(req: LoginRequest, db=Depends(get_db)):
    if not req.email.endswith("@sankaraeye.com"):
        raise HTTPException(status_code=403, detail="Invalid domain. Must use @sankaraeye.com email.")

    with db.cursor(cursor_factory=DictCursor) as cursor:
        cursor.execute("SELECT id, email, password_hash, full_name, role, unit_id, program_id, active, force_reset FROM users WHERE email = %s", (req.email.lower(),))
        user = cursor.fetchone()

    if not user or not user["active"]:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not pwd_context.verify(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if user["force_reset"]:
        # If they haven't reset their password yet, we force them to
        return {
            "require_reset": True,
            "email": user["email"]
        }

    token = create_access_token({
        "userId": user["id"],
        "email": user["email"],
        "role": user["role"]
    })

    return {
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "fullName": user["full_name"],
            "role": user["role"],
            "unitId": user["unit_id"],
            "programId": user["program_id"]
        }
    }

@app.post("/auth/reset-password")
def reset_password(req: ResetRequest, db=Depends(get_db)):
    with db.cursor(cursor_factory=DictCursor) as cursor:
        cursor.execute("SELECT id, email, password_hash, full_name, role, unit_id, program_id, active FROM users WHERE email = %s", (req.email.lower(),))
        user = cursor.fetchone()

    if not user or not user["active"]:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not pwd_context.verify(req.old_password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    new_hash = pwd_context.hash(req.new_password)

    with db.cursor() as cursor:
        cursor.execute("UPDATE users SET password_hash = %s, force_reset = false WHERE id = %s", (new_hash, user["id"]))
        db.commit()

    token = create_access_token({
        "userId": user["id"],
        "email": user["email"],
        "role": user["role"]
    })

    return {
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "fullName": user["full_name"],
            "role": user["role"],
            "unitId": user["unit_id"],
            "programId": user["program_id"]
        }
    }

class SyncRequest(BaseModel):
    spreadsheet_id: str

@app.post("/api/sync-students")
def sync_students_api(req: SyncRequest, db: Session = Depends(get_sqlalchemy_db)):
    try:
        result = sheets_sync.sync_students(db, req.spreadsheet_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("email")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    return payload

from models import Doctor, PanelDoctor, Student

@app.get("/api/doctor/context")
def get_doctor_context(current_user: dict = Depends(get_current_user), db: Session = Depends(get_sqlalchemy_db)):
    if current_user.get("role") != "doctor":
        raise HTTPException(status_code=403, detail="Not a doctor")
        
    email = current_user.get("email")
    doctor = db.query(Doctor).filter(Doctor.email == email).first()
    
    if not doctor:
        return {"is_panel_doctor": False, "has_allocated_students": False}
        
    is_panel_doctor = db.query(PanelDoctor).filter(PanelDoctor.doctor_id == doctor.id).first() is not None
    
    # Check if student is allocated by email or name. 
    # Let's check both or name
    has_allocated_students = db.query(Student).filter(
        (Student.allocated_doctor == doctor.name) | (Student.allocated_doctor == doctor.email)
    ).first() is not None
    
    return {
        "is_panel_doctor": is_panel_doctor,
        "has_allocated_students": has_allocated_students
    }

class PanelCreateRequest(BaseModel):
    specialization: str
    room: str
    time: datetime

class AssignDoctorsRequest(BaseModel):
    doctor_ids: List[int]

class AssignStudentsRequest(BaseModel):
    student_ids: List[int]

class UpdateStatusRequest(BaseModel):
    status: str

@app.get("/api/doctors")
def get_doctors(db: Session = Depends(get_sqlalchemy_db), user: dict = Depends(get_current_user)):
    docs = db.query(Doctor).all()
    return [{"id": d.id, "name": d.name, "specializations": d.specializations} for d in docs]

@app.get("/api/users/me")
def get_me(user: dict = Depends(get_current_user), db: Session = Depends(get_sqlalchemy_db)):
    db_user = db.query(models.User).filter(models.User.id == user["user_id"]).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "id": db_user.id,
        "name": db_user.name,
        "email": db_user.email,
        "role": db_user.role,
        "phone": db_user.phone,
        "address": db_user.address,
        "emp_id": db_user.emp_id,
        "unit": db_user.unit,
        "specialization": db_user.specialization
    }

class UserUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    emp_id: Optional[str] = None

@app.put("/api/users/me")
def update_me(data: UserUpdate, user: dict = Depends(get_current_user), db: Session = Depends(get_sqlalchemy_db)):
    db_user = db.query(models.User).filter(models.User.id == user["user_id"]).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if data.name is not None:
        db_user.name = data.name
    if data.phone is not None:
        db_user.phone = data.phone
    if data.address is not None:
        db_user.address = data.address
    if data.emp_id is not None:
        db_user.emp_id = data.emp_id
        
    db.commit()
    return {"message": "Profile updated"}

@app.get("/api/students")
def get_students(db: Session = Depends(get_sqlalchemy_db), user: dict = Depends(get_current_user)):
    stus = db.query(Student).all()
    return [{"id": s.id, "name": s.name, "specialization": s.specialization, "status": s.status} for s in stus]

from models import Panel, StudentPanelMap

class PsychometricScoreRequest(BaseModel):
    score: float
    recommendation: str

@app.get("/api/students/{student_id}")
def get_student(student_id: int, db: Session = Depends(get_sqlalchemy_db), user: dict = Depends(get_current_user)):
    s = db.query(Student).filter(Student.id == student_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Student not found")
    return {
        "id": s.id, "name": s.name, "email": s.email, "phone": s.phone,
        "specialization": s.specialization, "status": s.status,
        "psychometric_score": s.psychometric_score,
        "psychometric_recommendation": s.psychometric_recommendation,
        "psychometric_pdf": s.psychometric_pdf,
        "mcq_total": s.mcq_total,
        "mcq_marks": s.mcq_marks,
        "interview_avg": s.interview_avg,
        "final_score": s.final_score
    }

@app.post("/api/students/{student_id}/psychometric/upload")
def upload_psychometric(student_id: int, file: UploadFile = File(...), db: Session = Depends(get_sqlalchemy_db), user: dict = Depends(get_current_user)):
    if user.get("role") not in ["admin", "exam_coordinator"]:
        raise HTTPException(status_code=403, detail="Only coordinators can upload files")
    s = db.query(Student).filter(Student.id == student_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Student not found")
    
    file_location = f"uploads/{student_id}_{file.filename}"
    with open(file_location, "wb+") as file_object:
        shutil.copyfileobj(file.file, file_object)
        
    s.psychometric_pdf = f"/uploads/{student_id}_{file.filename}"
    db.commit()
    return {"success": True, "url": s.psychometric_pdf}

@app.post("/api/students/{student_id}/psychometric/score")
def save_psychometric_score(student_id: int, req: PsychometricScoreRequest, db: Session = Depends(get_sqlalchemy_db), user: dict = Depends(get_current_user)):
    if user.get("role") not in ["admin", "exam_coordinator"]:
        raise HTTPException(status_code=403, detail="Only coordinators can update scores")
    s = db.query(Student).filter(Student.id == student_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Student not found")
    
    s.psychometric_score = req.score
    s.psychometric_recommendation = req.recommendation
    db.commit()
    return {"success": True}


@app.get("/api/panels")
def get_panels(db: Session = Depends(get_sqlalchemy_db), user: dict = Depends(get_current_user)):
    if user.get("role") == "doctor":
        doctor = db.query(Doctor).filter(Doctor.email == user.get("email")).first()
        if not doctor:
            panels = []
        else:
            panel_ids = [pd.panel_id for pd in db.query(PanelDoctor).filter(PanelDoctor.doctor_id == doctor.id).all()]
            panels = db.query(Panel).filter(Panel.id.in_(panel_ids)).all() if panel_ids else []
    else:
        panels = db.query(Panel).all()
        
    result = []
    for p in panels:
        p_docs = db.query(PanelDoctor).filter(PanelDoctor.panel_id == p.id).all()
        p_stus = db.query(StudentPanelMap).filter(StudentPanelMap.panel_id == p.id).all()
        
        doc_ids = [pd.doctor_id for pd in p_docs]
        doctors = db.query(Doctor).filter(Doctor.id.in_(doc_ids)).all() if doc_ids else []
        
        stu_ids = [ps.student_id for ps in p_stus]
        students = db.query(Student).filter(Student.id.in_(stu_ids)).all() if stu_ids else []
        
        stu_status_map = {ps.student_id: ps.status for ps in p_stus}
        
        result.append({
            "id": p.id,
            "specialization": p.specialization,
            "room": p.room,
            "time": p.time,
            "doctors": [{"id": d.id, "name": d.name} for d in doctors],
            "students": [{"id": s.id, "name": s.name, "status": stu_status_map.get(s.id, "Pending")} for s in students]
        })
    return result

@app.post("/api/panels")
def create_panel(req: PanelCreateRequest, db: Session = Depends(get_sqlalchemy_db), user: dict = Depends(get_current_user)):
    new_panel = Panel(specialization=req.specialization, room=req.room, time=req.time)
    db.add(new_panel)
    db.commit()
    db.refresh(new_panel)
    return {"id": new_panel.id}

@app.post("/api/panels/{panel_id}/doctors")
def assign_doctors(panel_id: int, req: AssignDoctorsRequest, db: Session = Depends(get_sqlalchemy_db), user: dict = Depends(get_current_user)):
    for did in req.doctor_ids:
        if not db.query(PanelDoctor).filter_by(panel_id=panel_id, doctor_id=did).first():
            db.add(PanelDoctor(panel_id=panel_id, doctor_id=did))
    db.commit()
    return {"success": True}

@app.post("/api/panels/{panel_id}/students")
def assign_students(panel_id: int, req: AssignStudentsRequest, db: Session = Depends(get_sqlalchemy_db), user: dict = Depends(get_current_user)):
    for sid in req.student_ids:
        if not db.query(StudentPanelMap).filter_by(panel_id=panel_id, student_id=sid).first():
            db.add(StudentPanelMap(panel_id=panel_id, student_id=sid, status="Pending"))
    db.commit()
    return {"success": True}

@app.put("/api/panels/{panel_id}/students/{student_id}/status")
def update_student_status(panel_id: int, student_id: int, req: UpdateStatusRequest, db: Session = Depends(get_sqlalchemy_db), user: dict = Depends(get_current_user)):
    mapping = db.query(StudentPanelMap).filter_by(panel_id=panel_id, student_id=student_id).first()
    if not mapping:
        raise HTTPException(status_code=404, detail="Mapping not found")
    mapping.status = req.status
    db.commit()
    return {"success": True}
from pydantic import BaseModel
from sqlalchemy import desc
from models import SeatMatrix

class SeatMatrixCreateRequest(BaseModel):
    unit: str
    specialization: str
    seats: int

@app.get("/api/seats")
def get_seats(db: Session = Depends(get_sqlalchemy_db), user: dict = Depends(get_current_user)):
    return db.query(SeatMatrix).all()

@app.post("/api/seats")
def create_seat(req: SeatMatrixCreateRequest, db: Session = Depends(get_sqlalchemy_db), user: dict = Depends(get_current_user)):
    if user.get("role") not in ["admin", "exam_coordinator"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    s = SeatMatrix(unit=req.unit, specialization=req.specialization, seats=req.seats)
    db.add(s)
    db.commit()
    db.refresh(s)
    return s

@app.delete("/api/seats/{id}")
def delete_seat(id: int, db: Session = Depends(get_sqlalchemy_db), user: dict = Depends(get_current_user)):
    if user.get("role") not in ["admin", "exam_coordinator"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    db.query(SeatMatrix).filter(SeatMatrix.id == id).delete()
    db.commit()
    return {"success": True}

@app.get("/api/rank-list/{specialization}")
def get_rank_list(specialization: str, db: Session = Depends(get_sqlalchemy_db), user: dict = Depends(get_current_user)):
    students = db.query(Student).filter(Student.specialization == specialization, Student.final_score.isnot(None)).order_by(desc(Student.final_score)).all()
    result = []
    for i, s in enumerate(students):
        result.append({
            "rank": i + 1,
            "id": s.id,
            "name": s.name,
            "score": s.final_score,
            "unit": s.allocated_unit or "Unassigned"
        })
    return result

class AllocationOverrideRequest(BaseModel):
    allocated_unit: str
    allocated_doctor: str

@app.put("/api/students/{id}/allocation")
def override_allocation(id: int, req: AllocationOverrideRequest, db: Session = Depends(get_sqlalchemy_db), user: dict = Depends(get_current_user)):
    if user.get("role") not in ["admin", "exam_coordinator"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    s = db.query(Student).filter(Student.id == id).first()
    if not s:
        raise HTTPException(status_code=404)
    s.allocated_unit = req.allocated_unit
    s.allocated_doctor = req.allocated_doctor
    db.commit()
    return {"success": True}

@app.post("/api/allocation/run")
def run_allocation(db: Session = Depends(get_sqlalchemy_db), user: dict = Depends(get_current_user)):
    if user.get("role") not in ["admin", "exam_coordinator"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    
    # 1. Clear existing allocations
    # db.query(Student).update({Student.allocated_unit: None, Student.allocated_doctor: None})
    
    # 2. Get current seats
    matrix = db.query(SeatMatrix).all()
    seats_available = {(m.unit, m.specialization): m.seats for m in matrix}
    
    # 3. Get students sorted by final_score DESC
    students = db.query(Student).filter(Student.final_score.isnot(None)).order_by(desc(Student.final_score)).all()
    
    for s in students:
        # If already manually allocated, skip or maybe not? The user prompt said: FOR each student sorted by final_score DESC...
        # We will re-allocate everyone to be safe, but keep their manual allocations if they are valid?
        # Actually, let's just clear allocations for those we are re-allocating.
        
        prefs = s.preferred_units or []
        for pref in prefs:
            unit = pref.get("unit")
            spec = pref.get("specialization") or s.specialization
            if seats_available.get((unit, spec), 0) > 0:
                s.allocated_unit = unit
                seats_available[(unit, spec)] -= 1
                
                # Assign Doctor
                # Find doctors in that unit with matching specialization
                docs = db.query(Doctor).filter(Doctor.unit == unit).all()
                valid_docs = [d for d in docs if d.specializations and spec in d.specializations]
                if valid_docs:
                    s.allocated_doctor = valid_docs[0].name
                break
    db.commit()
    return {"success": True}

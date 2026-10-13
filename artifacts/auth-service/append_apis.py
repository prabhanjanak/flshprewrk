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

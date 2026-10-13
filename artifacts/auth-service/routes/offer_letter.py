import zipfile
import io
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session
import os

from database import get_sqlalchemy_db
from models import Student
from services.offer_letter_service import generate_offer_letter
from lib.auth import get_current_user

router = APIRouter(prefix="/api/offer-letter")

@router.get("/bulk")
def generate_bulk(db: Session = Depends(get_sqlalchemy_db), user: dict = Depends(get_current_user)):
    if user.get("role") not in ["admin", "exam_coordinator"]:
        raise HTTPException(status_code=403, detail="Forbidden")
        
    students = db.query(Student).filter(Student.allocated_unit.isnot(None), Student.allocated_doctor.isnot(None)).all()
    if not students:
        raise HTTPException(status_code=404, detail="No allocated students found")
        
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for student in students:
            try:
                file_path, file_type = generate_offer_letter(student, force=False)
                zip_file.write(file_path, arcname=os.path.basename(file_path))
            except Exception as e:
                print(f"Failed to generate for {student.name}: {e}")
                
    zip_buffer.seek(0)
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=Bulk_Offer_Letters.zip"}
    )

@router.get("/{student_id}")
def generate(student_id: int, force: bool = Query(False), db: Session = Depends(get_sqlalchemy_db), user: dict = Depends(get_current_user)):
    if user.get("role") not in ["admin", "exam_coordinator"]:
        raise HTTPException(status_code=403, detail="Forbidden")

    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    try:
        file_path, file_type = generate_offer_letter(student, force=force)
        media_type = "application/pdf" if file_type == "pdf" else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ext = "pdf" if file_type == "pdf" else "docx"
        return FileResponse(
            file_path, 
            media_type=media_type, 
            filename=f"{student.name.replace(' ', '_')}_offer_letter.{ext}"
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

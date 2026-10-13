from docxtpl import DocxTemplate
from docx2pdf import convert
from datetime import datetime
from num2words import num2words
import os
import pythoncom

def generate_offer_letter(student, force=False):
    if not student.allocated_unit or not student.allocated_doctor:
        raise Exception("Incomplete student data: Allocation not completed")

    template_path = "templates/offer_letter.docx"
    if not os.path.exists(template_path):
        raise Exception("Template missing")

    os.makedirs("generated", exist_ok=True)
    docx_path = f"generated/{student.id}_offer_letter.docx"
    pdf_path = f"generated/{student.id}_offer_letter.pdf"

    if not force:
        if os.path.exists(pdf_path):
            return pdf_path, "pdf"
        if os.path.exists(docx_path):
            return docx_path, "docx"

    doc = DocxTemplate(template_path)
    stipend = 40000

    context = {
        "letter_date": datetime.today().strftime("%d %B %Y"),
        "name": student.name,
        "address": student.address or "N/A",
        "specialization": student.specialization,
        "unit": student.allocated_unit,
        "start_date": student.joining_date.strftime("%d %B %Y") if student.joining_date else "TBD",
        "reporting_date": student.joining_date.strftime("%d %B %Y") if student.joining_date else "TBD",
        "reporting_doctor": student.allocated_doctor,
        "stipend": stipend,
        "stipend_words": num2words(stipend).title()
    }

    doc.render(context)
    doc.save(docx_path)
    
    # Initialize COM for docx2pdf conversion in this thread
    pythoncom.CoInitialize()
    try:
        convert(docx_path, pdf_path)
        return pdf_path, "pdf"
    except Exception as e:
        print(f"PDF conversion failed: {e}")
        return docx_path, "docx"
    finally:
        pythoncom.CoUninitialize()

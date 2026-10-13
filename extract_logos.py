import os

files = [
    'Dr.Aakanksha Bindal-IOL-JPR.doc',
    'Retina Fellowship Interviews Call Letter-June 2026.doc',
    'Anterior Fellowship Interview Call Letter-June 2026.doc'
]

os.makedirs('extracted_logos', exist_ok=True)

for fname in files:
    with open(fname, 'rb') as fp:
        data = fp.read()
    
    clean_name = os.path.splitext(fname)[0].replace(' ', '_')
    idx = 0
    img_count = 0
    while True:
        idx = data.find(b'\xff\xd8\xff', idx)
        if idx == -1:
            break
        end_idx = data.find(b'\xff\xd9', idx)
        if end_idx != -1:
            img_data = data[idx:end_idx+2]
            if len(img_data) > 500:
                img_name = f'extracted_logos/{clean_name}_img_{img_count}.jpg'
                with open(img_name, 'wb') as img_fp:
                    img_fp.write(img_data)
                print('Found JPEG in', fname, img_name, len(img_data), 'bytes')
                img_count += 1
            idx = end_idx + 2
        else:
            break

    idx = 0
    while True:
        idx = data.find(b'\x89PNG\r\n\x1a\n', idx)
        if idx == -1:
            break
        end_idx = data.find(b'IEND', idx)
        if end_idx != -1:
            img_data = data[idx:end_idx+8]
            img_name = f'extracted_logos/{clean_name}_img_{img_count}.png'
            with open(img_name, 'wb') as img_fp:
                img_fp.write(img_data)
            print('Found PNG in', fname, img_name, len(img_data), 'bytes')
            img_count += 1
            idx = end_idx + 8
        else:
            break

print('Total Extracted files:', os.listdir('extracted_logos'))

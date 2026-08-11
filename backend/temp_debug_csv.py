from pathlib import Path
from app.services.excel_service import _find_header_row, _guess_csv_delimiter, _normalize_line_endings
import csv

path = Path(r'c:\Users\AKASH\Downloads\Feedback - Exam Orientation 1 August 2026 .csv')
text = path.read_bytes().decode('utf-8', errors='replace')
text = _normalize_line_endings(text)
print('delimiter', _guess_csv_delimiter(text))
header = _find_header_row(path.read_bytes(), feedback_col='feedback', file_type='csv')
print('header row guessed', header)
# print first 20 rows using csv.reader
reader = csv.reader(text.splitlines(), delimiter=',', quotechar='"', skipinitialspace=True)
for i, row in enumerate(reader):
    if i <= 15 or i in [9,10,11,12]:
        print(i, len(row), row[:20])
    if i > 15:
        break

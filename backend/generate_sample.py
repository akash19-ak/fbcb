"""
Generate a sample Excel file with 100 feedback entries for testing.
Run: python generate_sample.py
"""

import pandas as pd
import random

random.seed(42)

POSITIVE_FEEDBACKS = [
    "The exam portal worked flawlessly throughout the session.",
    "I'm impressed by the smooth performance and quick load times.",
    "Great experience! The interface is very user-friendly and intuitive.",
    "The timer was accurate and the submission went smoothly.",
    "Excellent system support! The exam was a great experience overall.",
    "The platform is well-designed and I had no issues whatsoever.",
    "I really appreciate how stable the system was during the entire exam.",
    "Loved the clean UI. Everything was straightforward and easy to navigate.",
    "The server response was fantastic, no lag at all. Great work!",
    "Superb performance. I completed my exam without any interruption.",
]

NEGATIVE_FEEDBACKS = [
    "The server went down in the middle of my exam. Very frustrating!",
    "I was unable to submit my answers due to a technical error.",
    "The page kept freezing and I lost my progress multiple times.",
    "Terrible experience. The system crashed twice during the test.",
    "The timer malfunctioned and I lost precious time. Unacceptable!",
    "Could not access the exam at all. Server was down the whole time.",
    "The UI is very confusing. I could not find the submit button.",
    "My answers were not saved and I had to retype everything again.",
    "The system logged me out mid-exam for no reason whatsoever.",
    "Very poor performance. The page took forever to load each question.",
]

NEUTRAL_FEEDBACKS = [
    "The exam was okay. Nothing special but nothing terrible either.",
    "Average experience. Some sections worked fine, others had minor lag.",
    "It was alright. The interface is basic but functional enough.",
    "The exam completed without major issues but had occasional slowness.",
    "Decent portal. Could be improved with a better mobile experience.",
    "The system worked as expected. Nothing remarkable to report.",
    "Some features felt outdated but the core functionality was fine.",
    "Had to refresh once but everything was alright after that.",
    "Not bad, not great. The exam process was standard.",
    "The experience was neither exceptional nor terrible. Just normal.",
]

rows = []
for _ in range(40):
    rows.append({"feedback": random.choice(POSITIVE_FEEDBACKS)})
for _ in range(35):
    rows.append({"feedback": random.choice(NEGATIVE_FEEDBACKS)})
for _ in range(25):
    rows.append({"feedback": random.choice(NEUTRAL_FEEDBACKS)})

random.shuffle(rows)

# The API only accepts files matching the expected feedback-report export schema
# (Feedback Id, Content Id, a feedback text column, Reply Text) — see
# REQUIRED_SCHEMA_COLUMNS in app/services/excel_service.py.
df = pd.DataFrame({
    "Feedback Id": range(1, len(rows) + 1),
    "Content Id": [random.randint(1000, 9999) for _ in rows],
    "Feedback Text": [r["feedback"] for r in rows],
    "Reply Text": ["" for _ in rows],
})
df.to_excel("sample_feedback.xlsx", index=False)
print(f"✅ Generated sample_feedback.xlsx with {len(df)} rows.")

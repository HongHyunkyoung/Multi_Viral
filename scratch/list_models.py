import google.generativeai as genai
import os
from dotenv import load_dotenv

# Load from backend/.env
load_dotenv("backend/.env")
api_key = os.getenv("GEMINI_API_KEY") or os.getenv("Gemini_API_KEY")
genai.configure(api_key=api_key)

try:
    for m in genai.list_models():
        if 'generateContent' in m.supported_generation_methods:
            print(m.name)
except Exception as e:
    print(f"Error: {e}")

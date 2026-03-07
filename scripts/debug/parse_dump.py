import sys

filename = "/home/danh/novel-ai/dump.sql"
current_table = None

try:
    with open(filename, 'r', encoding='utf-8', errors='ignore') as f:
        for line in f:
            if line.startswith("COPY "):
                current_table = line.strip().split(" ")[1]
            
            if "These markers serve" in line or "Subject + Actio" in line:
                if current_table == "public.story_dictionary":
                    print(line.strip())
                    
except Exception as e:
    print(f"Error: {e}")

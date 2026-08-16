with open("tp_deductions.txt", "r", encoding="utf-8") as f:
    lines = f.readlines()

for line in lines:
    if not any(x in line for x in ["fix_", "patch_", "download_assets", "node_modules"]):
        # print line replacing non-ascii
        clean_line = line.encode('ascii', errors='replace').decode('ascii')
        print(clean_line.strip())

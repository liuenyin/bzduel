lines = open('task.md', 'r', encoding='utf-8').readlines()
with open('task.md', 'w', encoding='utf-8') as f:
    for line in lines:
        if "数据与名称修正" in line or "YZM 选科" in line or "简化战术卡名称" in line:
            f.write(line.replace('[ ]', '[x]').replace('[/]', '[x]'))
        elif "服务端引擎修复" in line or "AoE 修复" in line or "FFA 修复" in line or "firstBlood" in line:
            f.write(line.replace('[ ]', '[x]').replace('[/]', '[x]'))
        elif "客户端 Bug 修复" in line:
            f.write(line.replace('[ ]', '[/]'))
        else:
            f.write(line)

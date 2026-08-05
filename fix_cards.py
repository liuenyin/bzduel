import re

SUBJECTS = {
    'chinese': '语文', 'math': '数学', 'english': '英语', 'physics': '物理', 'chemistry': '化学', 'biology': '生物',
    'politics': '政治', 'history': '历史', 'geography': '地理', 'music': '音乐', 'art': '美术', 'it': '信息',
    'tech': '通技', 'pe': '体育', 'study': '自习', 'universal': '通用'
}
TYPES = {
    'CARD_TYPE.BLESSING': '祝福', 'CARD_TYPE.BUFF': '增益', 'CARD_TYPE.DEBUFF': '减益', 'CARD_TYPE.OTHER': '其他'
}

with open('shared/cards.js', 'r', encoding='utf-8') as f:
    content = f.read()

def replace_name(match):
    full_match = match.group(0)
    # Extract subject and type
    subj_match = re.search(r"subject:\s*'([^']+)'", full_match)
    type_match = re.search(r"type:\s*(CARD_TYPE\.[A-Z]+)", full_match)
    
    if subj_match and type_match:
        subj = subj_match.group(1)
        typ = type_match.group(1)
        subj_name = SUBJECTS.get(subj, subj)
        typ_name = TYPES.get(typ, typ)
        new_name = f"{subj_name}-{typ_name}"
        
        # Replace the old name
        return re.sub(r"name:\s*'[^']+'", f"name: '{new_name}'", full_match)
    return full_match

new_content = re.sub(r"\{\s*id:\s*'card_[^\{]+\}", replace_name, content)

with open('shared/cards.js', 'w', encoding='utf-8') as f:
    f.write(new_content)

print('Cards updated successfully.')

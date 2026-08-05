import re

# 1. prep.js neutral skill rendering
with open('src/pages/preparation.js', 'r', encoding='utf-8') as f:
    prep_content = f.read()

# Fix prep content: it didn't show neutral skills (type 'neutral')
old_prep = """
      <div class="skill-tags">
        ${charData.positiveSkill ? `<span class="skill-tag positive" onclick="alert('${charData.positiveSkill.desc}')" title="${charData.positiveSkill.desc}">+ ${charData.positiveSkill.name}</span>` : ''}
        ${charData.negativeSkill ? `<span class="skill-tag negative" onclick="alert('${charData.negativeSkill.desc}')" title="${charData.negativeSkill.desc}">- ${charData.negativeSkill.name}</span>` : ''}
      </div>
"""
new_prep = """
      <div class="skill-tags">
        ${charData.positiveSkill ? `<span class="skill-tag positive" onclick="alert('${charData.positiveSkill.desc}')" title="${charData.positiveSkill.desc}">+ ${charData.positiveSkill.name}</span>` : ''}
        ${charData.negativeSkill ? `<span class="skill-tag negative" onclick="alert('${charData.negativeSkill.desc}')" title="${charData.negativeSkill.desc}">- ${charData.negativeSkill.name}</span>` : ''}
        ${charData.neutralSkill ? `<span class="skill-tag neutral" onclick="alert('${charData.neutralSkill.desc}')" title="${charData.neutralSkill.desc}" style="background:var(--accent); color:black;">± ${charData.neutralSkill.name}</span>` : ''}
      </div>
"""
prep_content = prep_content.replace(old_prep.strip(), new_prep.strip())
with open('src/pages/preparation.js', 'w', encoding='utf-8') as f:
    f.write(prep_content)


# 2. lobby.js nickname check
with open('src/pages/lobby.js', 'r', encoding='utf-8') as f:
    lobby_content = f.read()

old_lobby = """  const savedName = localStorage.getItem('sdd_nickname');
  if (savedName) {
    nickname = savedName;
  } else {
    nickname = prompt("请输入你的昵称 (最多10个字符)：") || "Player";
    nickname = nickname.slice(0, 10);
    localStorage.setItem('sdd_nickname', nickname);
  }"""
new_lobby = """  const savedName = localStorage.getItem('sdd_nickname');
  if (savedName) {
    nickname = savedName;
  } else {
    nickname = prompt("请输入你的昵称 (最多10个字符)：") || "Player";
    nickname = nickname.trim();
    if (!nickname) nickname = "Player";
    nickname = nickname.slice(0, 10);
    localStorage.setItem('sdd_nickname', nickname);
  }"""
lobby_content = lobby_content.replace(old_lobby, new_lobby)

with open('src/pages/lobby.js', 'w', encoding='utf-8') as f:
    f.write(lobby_content)

print('prep.js and lobby.js patched.')

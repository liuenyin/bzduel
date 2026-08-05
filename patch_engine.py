import re

with open('server/game/engine.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. firstBlood AoE fix
# Find the firstBlood Triggered definition in aoeResults.push
content = content.replace(
    "firstBloodTriggered: damage > 0 && p.card.negativeSkill?.id === SKILL.FIRST_BLOOD && !p.hasTakenDamage",
    "firstBloodTriggered: damage > 0 && p.card.negativeSkill?.id === SKILL.FIRST_BLOOD && p.hasTakenDamage === true" # because we set it to true a few lines above.
)
# Wait, actually we can just use a local variable because checking p.hasTakenDamage === true might trigger for all subsequent hits.
# Let's fix the block:
old_firstblood = """
      if (damage > 0 && p.card.negativeSkill?.id === SKILL.FIRST_BLOOD && !p.hasTakenDamage) {
        p.hasTakenDamage = true;
        if (p.card.defSlots > 1) p.card.defSlots -= 1;
        firstBloodTriggeredGlobal = true;
      }
"""
new_firstblood = """
      let pFirstBloodTriggered = false;
      if (damage > 0 && p.card.negativeSkill?.id === SKILL.FIRST_BLOOD && !p.hasTakenDamage) {
        p.hasTakenDamage = true;
        if (p.card.defSlots > 1) p.card.defSlots -= 1;
        firstBloodTriggeredGlobal = true;
        pFirstBloodTriggered = true;
      }
"""
content = content.replace(old_firstblood.strip(), new_firstblood.strip())
content = content.replace(
    "firstBloodTriggered: damage > 0 && p.card.negativeSkill?.id === SKILL.FIRST_BLOOD && !p.hasTakenDamage,",
    "firstBloodTriggered: pFirstBloodTriggered,"
)


# 2. nineLives AoE fix
old_ninelives = """
      let pExtraTurnTriggered = false;
"""
new_ninelives = """
      let pNineLivesTriggered = false;
      if (p.hp <= 0 && p.card.positiveSkill?.id === SKILL.NINE_LIVES && !p.nineLivesUsed) {
        p.hp = 9;
        p.nineLivesUsed = true;
        p.dicePool = [8, 8, 8, 8, 8, 8];
        pNineLivesTriggered = true;
      }
      let pExtraTurnTriggered = false;
"""
content = content.replace(old_ninelives.strip(), new_ninelives.strip())
content = content.replace(
    "nineLivesTriggered: p.hp <= 0 && p.card.positiveSkill?.id === SKILL.NINE_LIVES && !p.nineLivesUsed",
    "nineLivesTriggered: pNineLivesTriggered"
)

# 3. FFA self-kill winner
old_selfkill = """
      if (atk.hp <= 0) {
        atk.isDead = true;
        gameOver = true;
        state.phase = PHASE.GAME_OVER;
        state.winner = state.turnData.defenderIdx;
      }
"""
new_selfkill = """
      if (atk.hp <= 0) {
        atk.isDead = true;
        if (state.gameMode === '1v1') {
          gameOver = true;
          state.phase = PHASE.GAME_OVER;
          state.winner = state.turnData.defenderIdx;
        } else {
           // In FFA, just check if game is over
           const alive = state.players.filter(p => !p.isDead);
           if (alive.length <= 1) {
             gameOver = true;
             state.phase = PHASE.GAME_OVER;
             state.winner = alive.length === 1 ? alive[0].id : 'draw';
           }
        }
      }
"""
content = content.replace(old_selfkill.strip(), new_selfkill.strip())

# 4. FFA dead attacker skipping (L1643-1654)
old_rotation = """
          let offset = state.currentSubRound;
          ni = state.firstAttacker;
          while(offset > 0) {
            ni = (ni + 1) % state.players.length;
            if (!state.players[ni].isDead) offset--;
          }
"""
new_rotation = """
          let offset = state.currentSubRound;
          ni = state.firstAttacker;
          while(offset > 0 || state.players[ni].isDead) {
            if (state.players[ni].isDead && offset == 0) {
               // If we are at offset 0 but the player is dead, keep advancing without decrementing offset
               ni = (ni + 1) % state.players.length;
            } else {
               ni = (ni + 1) % state.players.length;
               if (!state.players[ni].isDead) offset--;
            }
          }
"""
content = content.replace(old_rotation.strip(), new_rotation.strip())

# 5. FFA infinite loop (L1578)
old_loop = """
        let nextFirst = (state.firstAttacker + 1) % state.players.length;
        while (state.players[nextFirst].isDead && nextFirst !== state.firstAttacker) {
          nextFirst = (nextFirst + 1) % state.players.length;
        }
"""
new_loop = """
        let nextFirst = (state.firstAttacker + 1) % state.players.length;
        let attempts = 0;
        while (state.players[nextFirst].isDead && nextFirst !== state.firstAttacker && attempts < state.players.length) {
          nextFirst = (nextFirst + 1) % state.players.length;
          attempts++;
        }
"""
content = content.replace(old_loop.strip(), new_loop.strip())

with open('server/game/engine.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('Engine patched successfully.')

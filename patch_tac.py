import re
import sys

with open('server/game/engine.js', 'r', encoding='utf-8') as f:
    engine = f.read()

# Define the new calcTacticalCardEffects function
new_func = """function calcTacticalCardEffects(state, atk, def, keptRolls) {
  let atkBonus = 0;
  let defBonus = 0;
  let flatPierce = 0;
  let isNoFixedBonus = false;
  let maxDmgCap = Infinity;
  let damageMultiplier = 1.0;
  const curSubj = state.schedule[state.currentClassIndex];

  if (!atk || !def) return { atkBonus, defBonus, flatPierce, isNoFixedBonus, maxDmgCap, damageMultiplier };

  // 1. 检查攻击者的祝福与单轮卡 (Attacker's cards)
  const atkCards = [...(atk.activeBlessings || []), ...(atk.playedTurnCard ? [atk.playedTurnCard] : [])];
  atkCards.forEach(c => {
    switch (c.id) {
      case 'card_chi_1': if (curSubj === 'chinese') atkBonus += 2; break;
      case 'card_mat_2': atkBonus += 3; break;
      case 'card_pe_2': atkBonus += 4; break;
      
      // 通用增益卡 (Buffs played by attacker)
      case 'card_gen_02': atkBonus += 2; break; // 本回合基础攻击/防御总和+2
      case 'card_gen_04': flatPierce += 2; break; // 附加 2 点穿透伤害

      // 通用减益卡 (Debuffs played ON the attacker by defender)
      case 'card_gen_06': atkBonus -= 2; break; // 压制对方点数 (减弱攻击)

      case 'card_phy_1':
        if (curSubj === 'physics' && keptRolls) {
          const evens = keptRolls.filter(r => r % 2 === 0).length;
          atkBonus += evens * 2;
        }
        break;
      case 'card_phy_2': flatPierce += 3; break;
      case 'card_pol_1': if (curSubj === 'politics') isNoFixedBonus = true; break;
      case 'card_mus_1':
        if (curSubj === 'music' && keptRolls && keptRolls.length >= 2) {
          const maxR = Math.max(...keptRolls), minR = Math.min(...keptRolls);
          if (maxR - minR <= 2) damageMultiplier *= 1.3;
        }
        break;
      case 'card_mus_2':
        if (keptRolls && new Set(keptRolls).size < keptRolls.length) atkBonus += 4;
        break;
      case 'card_geo_1':
        if (curSubj === 'geography' && keptRolls && keptRolls.reduce((a,b)=>a+b,0) % 2 !== 0) atkBonus += 3;
        break;
      case 'card_geo_2':
        if (keptRolls) {
          const uniqueCount = new Set(keptRolls).size;
          if (uniqueCount >= 3) atkBonus += 3;
        }
        break;
    }
  });

  // 2. 检查防御者的祝福与单轮卡 (Defender's cards)
  const defCards = [...(def.activeBlessings || []), ...(def.playedTurnCard ? [def.playedTurnCard] : [])];
  defCards.forEach(c => {
    switch (c.id) {
      case 'card_pol_1': if (curSubj === 'politics') isNoFixedBonus = true; break;
      case 'card_pol_2': defBonus += 3; break;
      
      // 通用增益卡 (Buffs played by defender)
      case 'card_gen_02': defBonus += 2; break; // 本回合基础攻击/防御总和+2
      case 'card_gen_05': defBonus += 3; break; // 本回合防御固定减免 3

      // 通用减益卡 (Debuffs played ON the defender by attacker)
      case 'card_gen_06': defBonus -= 2; break; // 压制对方点数 (减弱防御)
      case 'card_gen_08': defBonus -= 2; break; // 创伤加深 (防御结算额外受2伤害)

      case 'card_tec_1': if (curSubj === 'tech') defBonus += 2; break;
      case 'card_pol_3': maxDmgCap = Math.min(maxDmgCap, 8); break;
      case 'card_bio_1': if (curSubj === 'biology') defBonus += 3; break;
      case 'card_his_1': if (curSubj === 'history') damageMultiplier *= 0.5; break;
    }
  });

  return { atkBonus, defBonus, flatPierce, isNoFixedBonus, maxDmgCap, damageMultiplier };
}"""

# Use regex to find and replace the function body
pattern = re.compile(r'function calcTacticalCardEffects\(state, atk, def, keptRolls\) \{.*?\n\}', re.DOTALL)
new_engine, count = pattern.subn(new_func, engine)

if count == 0:
    print("Function not found!")
    sys.exit(1)

with open('server/game/engine.js', 'w', encoding='utf-8') as f:
    f.write(new_engine)
print(f"Replaced {count} instances.")

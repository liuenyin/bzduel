import re
with open("server/game/engine.js", "r", encoding="utf-8") as f:
    code = f.read()

code = re.sub(
    r"let damage = ar\.pierce \? finalBaseAtk : Math\.max\(0, finalBaseAtk - finalFinalDef\);",
    """let damage = ar.pierce ? finalBaseAtk : Math.max(0, finalBaseAtk - finalFinalDef);
    damage += tac.flatPierce;
    damage = Math.floor(damage * tac.damageMultiplier);
    if (damage > tac.maxDmgCap) damage = tac.maxDmgCap;""",
    code,
    count=1
)

with open("server/game/engine.js", "w", encoding="utf-8") as f:
    f.write(code)

export function canChooseDreamTarget(state) {
  if (!state || state.phase !== 'battle' || state.draftShop?.active) return false;
  if (state.turnPhase !== 'waiting_atk' && state.turnPhase !== 'choose_target') return false;
  const me = state.me;
  const attacker = state.players?.[state.attackerIdx];
  const fxr = state.players?.find(player => (player?.card?.positiveSkill?.id === 'dream_king' || player?.cardId === 'char_fxr')
    && !player.isDead && player.hp > 0);
  if (!me || me.isDead || me.hp <= 0 || !attacker || attacker.isDead || attacker.hp <= 0
    || !fxr || fxr.lgpyForm || fxr.dreamTargetChoice != null) return false;

  // If the Dream King is defending, only the current attacker may choose.
  // If the Dream King is attacking, any living opponent may make the blind
  // choice; the server accepts the first valid choice and rejects duplicates.
  return attacker.id === fxr.id ? me.id !== fxr.id : attacker.id === me.id;
}

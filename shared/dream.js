// Works with both engine players and public views, where HP may be hidden.
export function getActiveDreamPlayer(players) {
  return players?.find(player => player?.card?.positiveSkill?.id === 'dream_king'
    && !player.isDead && (player.hp === '??' || player.hp > 0)
    && player.inDreamState && !player.lgpyForm) || null;
}

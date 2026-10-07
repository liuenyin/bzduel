export const ATTACK_TACTICAL_CARDS = new Set([
  'card_phy_2', 'card_phy_3', 'card_his_2', 'card_art_2', 'card_it_3',
  'card_mus_2', 'card_pe_2', 'card_pe_3', 'card_gen_04', 'card_gen_08', 'card_gen_15',
]);
export const DEFENSE_TACTICAL_CARDS = new Set([
  'card_bio_2', 'card_pol_2', 'card_his_3', 'card_gen_05', 'card_gen_14',
]);
export const CLASH_TACTICAL_CARDS = new Set([
  'card_chi_2', 'card_chi_3', 'card_mat_2', 'card_mat_3', 'card_eng_3',
  'card_geo_2', 'card_geo_3', 'card_mus_3', 'card_art_3', 'card_tec_2',
  'card_stu_2', 'card_gen_01', 'card_gen_02', 'card_gen_06', 'card_gen_09',
  'card_gen_10', 'card_gen_12', 'card_gen_13',
]);
export const OPPONENT_TARGET_TACTICAL_CARDS = new Set([
  'card_chi_3', 'card_mat_3', 'card_phy_3', 'card_che_3', 'card_bio_3',
  'card_pol_3', 'card_geo_3', 'card_it_2', 'card_pe_3', 'card_gen_06',
  'card_gen_07', 'card_gen_08', 'card_gen_09', 'card_gen_10',
]);

// These effects need one specific opponent immediately. In FFA the attacker
// has no opponent until a target is selected, so allowing them earlier would
// make the engine fall back to an arbitrary living player.
export const DIRECT_OPPONENT_TACTICAL_CARDS = new Set([
  'card_it_1', 'card_che_3', 'card_bio_3', 'card_it_2', 'card_pe_3',
  'card_gen_07', 'card_gen_09', 'card_gen_10',
]);

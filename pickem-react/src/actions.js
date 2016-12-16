
export const SWAP_MATCHUP_ORDER = 'SWAP_MATCHUP_ORDER';
export const SET_MATCHUP_PREVIEW = 'SET_MATCHUP_PREVIEW';

export function swapMatchupOrder(id, src, dst) {
    return {
        type: SWAP_MATCHUP_ORDER,
        id,
        src,
        dst
    };
}

export function setMatchupPreview(dst) {
    return {
        type: SET_MATCHUP_PREVIEW,
        dst
    };
}

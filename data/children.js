export const CHILDREN = [
  {
    id: "ichio",
    name: "壱鳳",
    displayName: "壱鳳",
    themeClass: "theme-ichio",
    themeName: "Ichio",
    shortDescription: "今日の一歩を積み重ねる",
    initial: "壱",
    defaultScreenTitle: "壱鳳の今日のミッション"
  },
  {
    id: "sakuno",
    name: "朔埜",
    displayName: "朔埜",
    themeClass: "theme-sakuno",
    themeName: "Sakuno",
    shortDescription: "できたことを一つずつ増やす",
    initial: "朔",
    defaultScreenTitle: "朔埜の今日のミッション"
  }
];

export const CHILD_IDS = Object.freeze({
  ICHIO: "ichio",
  SAKUNO: "sakuno"
});

export function getChildById(childId) {
  return CHILDREN.find((child) => child.id === childId) ?? null;
}

export function isValidChildId(childId) {
  return CHILDREN.some((child) => child.id === childId);
}
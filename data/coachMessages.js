export const COACH_PROFILES = Object.freeze({
  ichio: {
    type: "Support Coach",
    label: "SUPPORT COACH",
    start: [
      "まずは5分だけ始めよう。始められたら、今日の大きな一歩だ。",
      "全部を一度に考えなくて大丈夫。最初のミッションから進めよう。",
      "やる気は、始めたあとについてくる。小さくスタートしよう。"
    ],
    progress: [
      "もう一歩進めたね。できたことを積み重ねれば大丈夫。",
      "良い流れだね。今の集中を、次の一つにつなげよう。",
      "途中まででも確かな前進。焦らず、自分のペースで進もう。"
    ],
    complete: [
      "MISSION COMPLETE。今日やり切った経験が、明日の自信になる。",
      "最後まで進めたね。今日の一歩は、確実に力になっている。",
      "よくやり切った。好きになったときの強さを、今日も育てられたね。"
    ],
    review: "今日できたことを一つ見つけよう。小さな一歩で十分だよ。"
  },
  sakuno: {
    type: "Challenge Coach",
    label: "CHALLENGE COACH",
    start: [
      "今日のチャレンジ開始！どこまで気持ちよく進められるか試してみよう。",
      "準備はいい？今日も自分のベストを一つ更新しよう！",
      "楽しみながら本気で挑戦しよう。最初のミッションへスタート！"
    ],
    progress: [
      "ナイスチャレンジ！この勢いで次のクリアを狙おう。",
      "良い集中！昨日の自分を一歩こえているよ。",
      "順調だね！次はどこまで記録を伸ばせるかな？"
    ],
    complete: [
      "GREAT JOB！今日のチャレンジ、全部クリア！",
      "MISSION COMPLETE！努力の成果をしっかり出せたね。",
      "最高のトレーニングだったね！今日も自分を更新できたよ。"
    ],
    review: "今日のベストプレーは何だった？楽しかった挑戦を一つ残そう！"
  }
});

export function getCoachProfile(childId) {
  return COACH_PROFILES[childId] ?? COACH_PROFILES.ichio;
}

export function getCoachMessage(childId, completedCount, totalCount, dateKey = "") {
  const profile = getCoachProfile(childId);
  let group = profile.start;

  if (totalCount > 0 && completedCount >= totalCount) {
    group = profile.complete;
  } else if (completedCount > 0) {
    group = profile.progress;
  }

  const seed = Array.from(String(dateKey)).reduce((sum, character) => {
    return sum + character.charCodeAt(0);
  }, completedCount + totalCount);

  return group[seed % group.length];
}

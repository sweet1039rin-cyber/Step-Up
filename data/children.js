window.StepUpData = window.StepUpData || {};

window.StepUpData.children = {
  iori: {
    name: '壱凰 / IORI',
    focus: '7月21日 今日のミッション',
    sub: '午前は英語と数学、夜は課題テスト対策を一つずつ進める。',
    priority: '午前の予定を守り、夜は数学・社会・ことばのきまりを優先する',
    priorityText: '外出後は無理に詰め込まず、筋トレを挟んで集中を切り替える。丸付けまでできたら大きなStep Up。',
    goals: ['英語 新研究とジョイフルワークを進める', 'どこスタ数学に1時間取り組む', '夜に数学・社会・ことばのきまりを進める', '丸付け・振り返りまで行う'],
    tasks: [['09:00', '朝活：最重要不規則動詞', '20分'], ['09:20', '英語 新研究', '60分'], ['10:30', 'ジョイフルワーク', '60分'], ['11:30', 'どこスタ数学', '60分'], ['13:00', '昼食・外出', '17:30まで'], ['18:00', '夕食・休憩', '60分'], ['19:00', '筋トレ', '20分'], ['19:20', '数学 新研究', '60分'], ['20:30', '社会 新研究', '60分'], ['21:40', 'ことばのきまり', '40分'], ['22:20', '国語・理科の丸付け／今日のStep Up', '40分']]
  },
  sakuya: {
    name: '朔埜 / SAKUYA',
    focus: '今日のミッション',
    sub: '楽しく進めて、今日のゴールを一つずつクリア。',
    priority: '今日の課題を1つずつ進める',
    priorityText: '残っている課題から、進めやすいものを選んで取り組もう。',
    goals: ['サマースクールの丸付け', '国語・理科の続き', '数学の続き', '丸付け・振り返りまで行う'],
    tasks: [['08:00', '朝活：サマースクール丸付け', '30分'], ['09:00', '国語 学習', '40分'], ['09:50', '漢字スキル', '40分'], ['11:00', '数学 学習', '60分'], ['13:30', '英語 学習', '40分'], ['14:30', '理科 学習', '50分'], ['15:30', '社会 学習', '30分'], ['16:10', '丸付け・振り返り', '30分']]
  }
};

window.StepUpData.testEvents = {
  iori: [{title: '5教科課題テスト①', date: '2026-08-25', subject: '国語・数学・社会'}, {title: '5教科課題テスト②', date: '2026-08-26', subject: '理科・英語'}, {title: '不規則動詞テスト', date: '2026-09-02', subject: '英語'}, {title: '単元テスト', date: '2026-09-03', subject: '英語'}],
  sakuya: [{title: '確認テスト', date: '2026-08-28', subject: '国語・算数'}, {title: '漢字テスト', date: '2026-08-05', subject: '国語'}]
};

window.StepUpData.childCatalog = [
  {id: 'iori', name: '壱凰', themeClass: 'theme-ichio', themeName: 'Ichio', shortDescription: '今日の一歩を積み重ねる', initial: '壱'},
  {id: 'sakuya', name: '朔埜', themeClass: 'theme-sakuno', themeName: 'Sakuno', shortDescription: 'できたことを一つずつ増やす', initial: '朔'}
];

window.StepUpData.assignments = {
  iori: {
    childName: '壱凰',
    weekdayPolicy: {
      priority: '主要5教科を優先する',
      excluded: ['リコーダー', '家庭科']
    },
    items: [
      {id: 'iori-essay', subject: '国語', title: '作文', status: 'completed', progress: '完了', remaining: 'なし', priority: 2, category: 'submission'},
      {id: 'iori-japanese-research', subject: '国語', title: '国語新研究', status: 'in-progress', progress: '学習済み', remaining: '答え合わせ', priority: 1, category: 'school-homework'},
      {id: 'iori-history-study', subject: '社会', title: '歴史の学習', status: 'completed', progress: '答え合わせまで完了', remaining: 'なし', priority: 1, category: 'school-homework'},
      {id: 'iori-social-research', subject: '社会', title: '社会新研究', status: 'in-progress', progress: '学習済み', remaining: '答え合わせ', priority: 1, category: 'school-homework'},
      {id: 'iori-kazutomo', subject: '数学', title: '数学の友', status: 'completed', progress: '答え合わせまで完了', remaining: 'なし', priority: 1, category: 'school-homework'},
      {id: 'iori-science-research', subject: '理科', title: '理科新研究', status: 'completed', progress: '答え合わせまで完了', remaining: 'なし', priority: 1, category: 'school-homework'},
      {id: 'iori-english-research', subject: '英語', title: '英語新研究', status: 'in-progress', progress: 'P86まで完了', remaining: 'P86以降', priority: 1, category: 'school-homework'},
      {id: 'iori-joyful-work', subject: '英語', title: 'ジョイフルワーク', status: 'in-progress', progress: 'P8まで完了', remaining: 'P8以降', priority: 1, category: 'school-homework'},
      {id: 'iori-integrated-study', subject: '総合', title: '総合', status: 'completed', progress: '完了', remaining: 'なし', priority: 2, category: 'submission'}
    ]
  },
  sakuya: {
    childName: '朔埜',
    weekdayPolicy: {
      priority: '主要教科を優先する',
      weekendSupport: '副教科は休日に保護者と進める'
    },
    items: [
      {id: 'sakuya-reading-report', subject: '国語', title: '読書感想文', status: 'completed', progress: '完了', remaining: 'なし', priority: 2, category: 'submission'},
      {id: 'sakuya-word-order-training', subject: '英語', title: 'くり返し語順トレーニング', status: 'completed', progress: '完了', remaining: 'なし', priority: 1, category: 'school-homework'},
      {id: 'sakuya-elementary-english-words', subject: '英語', title: '小学英単語', status: 'completed', progress: '完了', remaining: 'なし', priority: 1, category: 'school-homework'},
      {id: 'sakuya-home-economics-handnote', subject: '家庭科', title: '家庭科ハンドノート', status: 'completed', progress: '完了', remaining: 'なし', priority: 3, category: 'school-homework'},
      {id: 'sakuya-summer-math', subject: '数学', title: 'サマースクール数学', status: 'in-progress', progress: '残り9ページ', remaining: '9ページ', priority: 1, category: 'school-homework'},
      {id: 'sakuya-japanese', subject: '国語', title: '国語', status: 'in-progress', progress: '残り10ページ', remaining: '10ページ', priority: 1, category: 'school-homework'},
      {id: 'sakuya-kanji-skill', subject: '国語', title: '漢字スキル', status: 'in-progress', progress: '残り1ページ', remaining: '1ページ', priority: 1, category: 'school-homework'},
      {id: 'sakuya-ima-dekiru', subject: '総合', title: '今の私に出来ること', status: 'not-started', progress: '未着手', remaining: '全体', priority: 2, category: 'submission'},
      {id: 'sakuya-woodwork', subject: '技術', title: '木工作品', status: 'not-started', progress: '未着手', remaining: '全体', priority: 3, category: 'holiday-project'},
      {id: 'sakuya-gagaku', subject: '音楽', title: '雅楽', status: 'not-started', progress: '未着手', remaining: '全体', priority: 3, category: 'holiday-project'},
      {id: 'sakuya-keynote', subject: '技術', title: 'Keynote', status: 'not-started', progress: '未着手', remaining: '全体', priority: 3, category: 'holiday-project'},
      {id: 'sakuya-disaster-report', subject: '総合', title: '防災レポート', status: 'not-started', progress: '未着手', remaining: '全体', priority: 2, category: 'submission'}
    ]
  }
};
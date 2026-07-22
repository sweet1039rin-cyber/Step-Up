(function () {
  window.StepUpData = window.StepUpData || {};

function createDefaultTask({
  taskId,
  childId,
  title,
  category,
  priority,
  startTime,
  durationMinutes,
  subject,
  materialId,
  materialName,
  instructions
}) {
  return {
    taskId,
    childId,
    date: "",
    title,
    category,
    priority,
    startTime,
    durationMinutes,
    completed: false,
    subject,
    materialId,
    materialName,
    pageFrom: "",
    pageTo: "",
    problemCount: "",
    instructions,
    deadline: "",
    understanding: "",
    parentNote: "",
    childNote: "",
    rescheduledFrom: ""
  };
}

const DEFAULT_SCHEDULES = {
  ichio: [
    createDefaultTask({
      taskId: "default-ichio-morning-english",
      childId: "ichio",
      title: "朝活：英単語",
      category: "morning-study",
      priority: 1,
      startTime: "06:30",
      durationMinutes: 15,
      subject: "英語",
      materialId: "ichio-english-words",
      materialName: "英単語",
      instructions: "無理のない範囲で、昨日の続きから取り組む。"
    }),
    createDefaultTask({
      taskId: "default-ichio-math",
      childId: "ichio",
      title: "数友：二次方程式",
      category: "school-homework",
      priority: 2,
      startTime: "19:30",
      durationMinutes: 30,
      subject: "数学",
      materialId: "ichio-kazutomo",
      materialName: "数友",
      instructions: "夕食の前後で取り組み、分からない問題には印を付ける。"
    }),
    createDefaultTask({
      taskId: "default-ichio-physics",
      childId: "ichio",
      title: "先生との物理授業",
      category: "lesson",
      priority: 1,
      startTime: "21:00",
      durationMinutes: 60,
      subject: "物理",
      materialId: "ichio-physics-lesson",
      materialName: "物理授業",
      instructions: "授業前にノートと教材を準備する。"
    })
  ],
  sakuno: [
    createDefaultTask({
      taskId: "default-sakuno-homework",
      childId: "sakuno",
      title: "学校の宿題",
      category: "school-homework",
      priority: 1,
      startTime: "17:00",
      durationMinutes: 30,
      subject: "",
      materialId: "sakuno-school-homework",
      materialName: "学校の宿題",
      instructions: "提出期限が近い宿題から始める。"
    }),
    createDefaultTask({
      taskId: "default-sakuno-english",
      childId: "sakuno",
      title: "英単語の確認",
      category: "morning-study",
      priority: 2,
      startTime: "18:00",
      durationMinutes: 15,
      subject: "英語",
      materialId: "sakuno-english-words",
      materialName: "英単語",
      instructions: "覚えにくい単語を三つ選んで確認する。"
    }),
    createDefaultTask({
      taskId: "default-sakuno-math",
      childId: "sakuno",
      title: "数学の苦手問題",
      category: "weak-point",
      priority: 3,
      startTime: "19:00",
      durationMinutes: 20,
      subject: "数学",
      materialId: "sakuno-math-practice",
      materialName: "数学問題集",
      instructions: "一問ずつ途中式を書いて取り組む。"
    })
  ]
};

function getDefaultScheduleByChildId(childId) {
  const schedule = DEFAULT_SCHEDULES[childId];

  if (!Array.isArray(schedule)) {
    return [];
  }

  return schedule.map((task) => ({
    ...task
  }));
}

  window.StepUpData.defaultSchedules = {
    items: DEFAULT_SCHEDULES,
    getByChildId: getDefaultScheduleByChildId
  };
})();
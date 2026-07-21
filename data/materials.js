export const MATERIAL_CATEGORIES = [
  {
    id: "school-homework",
    name: "学校の宿題"
  },
  {
    id: "submission",
    name: "提出物"
  },
  {
    id: "test-study",
    name: "定期テスト"
  },
  {
    id: "weak-point",
    name: "苦手単元"
  },
  {
    id: "advanced-study",
    name: "発展学習"
  },
  {
    id: "lesson",
    name: "授業・講習"
  },
  {
    id: "morning-study",
    name: "朝活"
  },
  {
    id: "other",
    name: "その他"
  }
];

export const SUBJECTS = [
  "国語",
  "数学",
  "英語",
  "理科",
  "社会",
  "物理",
  "化学",
  "生物",
  "地学",
  "日本史",
  "世界史",
  "地理",
  "情報",
  "保健体育",
  "音楽",
  "美術",
  "技術・家庭",
  "その他"
];

export const MATERIALS = [
  {
    id: "ichio-kazutomo",
    childId: "ichio",
    name: "数友",
    subject: "数学",
    category: "school-homework"
  },
  {
    id: "ichio-english-words",
    childId: "ichio",
    name: "英単語",
    subject: "英語",
    category: "morning-study"
  },
  {
    id: "ichio-physics-lesson",
    childId: "ichio",
    name: "物理授業",
    subject: "物理",
    category: "lesson"
  },
  {
    id: "sakuno-school-homework",
    childId: "sakuno",
    name: "学校の宿題",
    subject: "",
    category: "school-homework"
  },
  {
    id: "sakuno-english-words",
    childId: "sakuno",
    name: "英単語",
    subject: "英語",
    category: "morning-study"
  },
  {
    id: "sakuno-math-practice",
    childId: "sakuno",
    name: "数学問題集",
    subject: "数学",
    category: "weak-point"
  }
];

export function getMaterialsByChildId(childId) {
  return MATERIALS.filter((material) => material.childId === childId);
}

export function getMaterialById(materialId) {
  return MATERIALS.find((material) => material.id === materialId) ?? null;
}

export function getCategoryById(categoryId) {
  return (
    MATERIAL_CATEGORIES.find((category) => category.id === categoryId) ?? null
  );
}
// ========== 模拟数据库 ==========

export const mockDatabase = {
  orders: {
    "ORD001": { id: "ORD001", user: "小明", product: "iPhone 15", price: 5999, status: "已发货" },
    "ORD002": { id: "ORD002", user: "小红", product: "MacBook Pro", price: 12999, status: "配送中" },
    "ORD003": { id: "ORD003", user: "小明", product: "AirPods Pro", price: 1999, status: "已完成" },
  },
  users: {
    "小明": { name: "小明", vip: true, points: 1500, joinDate: "2023-05-20" },
    "小红": { name: "小红", vip: false, points: 200, joinDate: "2024-01-10" },
  },
};

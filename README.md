<h1 align="center">⛽ Fuelodo – Smart Fuel Management System</h1>

<p align="center">
  🚀 Live • 📊 Analytics • 🔐 Secure • 💡 Real-world App
</p>

<p align="center">
  <a href="https://fuelodo.web.app/"><img src="https://img.shields.io/badge/Live-Demo-success?style=for-the-badge"></a>
  <img src="https://img.shields.io/badge/Status-Production--Ready-brightgreen?style=for-the-badge">
  <img src="https://img.shields.io/badge/Built%20With-Firebase-orange?style=for-the-badge">
  <img src="https://img.shields.io/badge/Frontend-JavaScript-yellow?style=for-the-badge">
</p>

---

## 🌐 Live Application  
👉 https://fuelodo.web.app/

---

## 📌 About The Project  

**Fuelodo** is a modern, real-time fuel management web application designed for **daily usage**.  
It helps users track fuel consumption, analyze mileage, manage vehicles, and generate reports effortlessly.

💡 Unlike typical academic projects, Fuelodo is:
- ✅ Fully deployed
- ✅ Actively usable
- ✅ Designed for real-world scenarios

---

## 🎯 Problem Statement  

Managing fuel expenses manually leads to:
- ❌ No tracking of mileage
- ❌ Poor expense visibility
- ❌ No service reminders
- ❌ Lack of insights

---

## 💡 Solution  

Fuelodo provides:
- 📊 Real-time analytics  
- ⛽ Smart fuel tracking  
- 🔔 Service reminders  
- 📁 Exportable reports  

---

## ✨ Key Features  

### 🚗 Vehicle Management
- Add multiple vehicles
- Track individual performance

### ⛽ Fuel Tracking
- Log fuel entries
- Auto cost calculation
- Mileage calculation

### 📊 Dashboard Analytics
- Mileage gauge visualization
- Expense insights
- Trend tracking

### 📁 Records System
- Filter by date & vehicle
- Cost/km tracking

### 📈 Reports & Export
- Monthly summary
- Export CSV & PDF

### 🔔 Smart Alerts
- Maintenance reminders
- Insights for efficiency

### 🔐 Authentication
- Google Sign-In
- Email login
- Firebase secure auth

---

## 🏗️ Architecture  

```mermaid
graph TD
A[User Browser] --> B[Frontend (HTML/CSS/JS)]
B --> C[Firebase Authentication]
B --> D[Firestore Database]
B --> E[Firebase Hosting]

C --> D
D --> B

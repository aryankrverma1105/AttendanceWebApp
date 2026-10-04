import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import prisma from "../src/config/prisma";
import { hashPassword } from "../src/utils/password.utils";

async function main() {
  console.log("Seeding Sologix Energy database...");

  const defaultPasswordHash = await hashPassword("Password123!");

  // 1. Create Admin User
  const adminUser = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      username: "admin",
      email: "admin@example.com",
      passwordHash: defaultPasswordHash,
      role: "ADMIN",
      name: "Super Admin",
      isEmailVerified: true,
      bio: "Sologix Energy Platform Administrator",
    },
  });

  // 2. Create Manager User
  const managerUser = await prisma.user.upsert({
    where: { email: "manager@example.com" },
    update: {},
    create: {
      username: "manager",
      email: "manager@example.com",
      passwordHash: defaultPasswordHash,
      role: "MANAGER",
      name: "Vikram Malhotra",
      photoUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
      isEmailVerified: true,
      bio: "Field Operations Director",
    },
  });

  // 3. Departments
  const deptEngineering = await prisma.department.upsert({
    where: { name: "Field Engineering" },
    update: {},
    create: { name: "Field Engineering" },
  });

  const deptOperations = await prisma.department.upsert({
    where: { name: "Client Services" },
    update: {},
    create: { name: "Client Services" },
  });

  // 4. Shifts
  const dayShift = await prisma.shift.create({
    data: {
      name: "Standard Day Shift",
      startTime: "09:00",
      endTime: "18:00",
      timezone: "Asia/Kolkata",
      gracePeriodMinutes: 15,
      overtimePolicy: "STANDARD",
      active: true,
    },
  });

  const nightShift = await prisma.shift.create({
    data: {
      name: "Overnight Operations Shift",
      startTime: "22:00",
      endTime: "06:00",
      timezone: "Asia/Kolkata",
      gracePeriodMinutes: 15,
      overtimePolicy: "STANDARD",
      active: true,
    },
  });

  // 5. Geofences
  const hqGeofence = await prisma.geofence.create({
    data: {
      name: "Main Corporate HQ",
      type: "OFFICE",
      latitude: 17.4485,
      longitude: 78.3768,
      radiusMeters: 250,
      address: "HITEC City, Hyderabad, Telangana",
      active: true,
    },
  });

  const siteAGeofence = await prisma.geofence.create({
    data: {
      name: "Customer Site A - Nexus Tech",
      type: "CUSTOMER_SITE",
      latitude: 17.4435,
      longitude: 78.3820,
      radiusMeters: 200,
      address: "Cyber Towers Area, Hyderabad",
      active: true,
    },
  });

  const siteWestGeofence = await prisma.geofence.create({
    data: {
      name: "Field Site West Substation",
      type: "FIELD_SITE",
      latitude: 17.4350,
      longitude: 78.3650,
      radiusMeters: 300,
      address: "Kondapur Hub, Hyderabad",
      active: true,
    },
  });

  const remoteGeofence = await prisma.geofence.create({
    data: {
      name: "Approved Remote Workspace",
      type: "REMOTE",
      latitude: 17.4500,
      longitude: 78.3900,
      radiusMeters: 150,
      address: "Madhapur, Hyderabad",
      active: true,
    },
  });

  // 6. Employees
  const employeeData = [
    {
      username: "rahul",
      email: "rahul@example.com",
      name: "Rahul Kumar",
      code: "EMP101",
      phone: "+91 98765 43210",
      photoUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
      deptId: deptEngineering.id,
      shiftId: dayShift.id,
      geofenceId: siteAGeofence.id,
      status: "WORKING",
      lat: 17.4436,
      lng: 78.3821,
    },
    {
      username: "priya",
      email: "priya@example.com",
      name: "Priya Sharma",
      code: "EMP102",
      phone: "+91 98765 43211",
      photoUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80",
      deptId: deptEngineering.id,
      shiftId: dayShift.id,
      geofenceId: hqGeofence.id,
      status: "WORKING",
      lat: 17.4486,
      lng: 78.3769,
    },
    {
      username: "arjun",
      email: "arjun@example.com",
      name: "Arjun Verma",
      code: "EMP103",
      phone: "+91 98765 43212",
      photoUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80",
      deptId: deptOperations.id,
      shiftId: dayShift.id,
      geofenceId: siteWestGeofence.id,
      status: "AWAY",
      lat: 17.4320,
      lng: 78.3610,
    },
    {
      username: "sneha",
      email: "sneha@example.com",
      name: "Sneha Patel",
      code: "EMP104",
      phone: "+91 98765 43213",
      photoUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80",
      deptId: deptOperations.id,
      shiftId: dayShift.id,
      geofenceId: remoteGeofence.id,
      status: "REMOTE_WORKING",
      lat: 17.4501,
      lng: 78.3902,
    },
  ];

  for (const emp of employeeData) {
    const user = await prisma.user.upsert({
      where: { email: emp.email },
      update: {},
      create: {
        username: emp.username,
        email: emp.email,
        passwordHash: defaultPasswordHash,
        role: "EMPLOYEE",
        name: emp.name,
        photoUrl: emp.photoUrl,
        isEmailVerified: true,
      },
    });

    const employee = await prisma.employee.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        employeeCode: emp.code,
        phone: emp.phone,
        departmentId: emp.deptId,
        defaultShiftId: emp.shiftId,
        employmentStatus: "ACTIVE",
        currentStatus: emp.status,
        lastLatitude: emp.lat,
        lastLongitude: emp.lng,
        lastLocationUpdate: new Date(),
        punctualityScore: 96.5,
      },
    });

    // Assign Geofence
    await prisma.employeeGeofence.upsert({
      where: {
        employeeId_geofenceId: {
          employeeId: employee.id,
          geofenceId: emp.geofenceId,
        },
      },
      update: {},
      create: {
        employeeId: employee.id,
        geofenceId: emp.geofenceId,
        priority: 1,
      },
    });

    // Create Sample Attendance for Today
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    const workDate = `${y}-${m}-${d}`;

    const checkInTime = new Date();
    checkInTime.setHours(8, 55, 0, 0);

    await prisma.attendance.upsert({
      where: {
        employeeId_workDate: {
          employeeId: employee.id,
          workDate,
        },
      },
      update: {},
      create: {
        employeeId: employee.id,
        shiftId: emp.shiftId,
        workDate,
        checkInAt: checkInTime,
        status: emp.status,
        workingMinutes: 120,
        overtimeMinutes: 0,
        isLateArrival: false,
      },
    });
  }

  console.log("Seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { StudentLayout } from '../components/layouts/StudentLayout';
import { OperatorLayout } from '../components/layouts/OperatorLayout';

import { WelcomePage } from '../pages/public/WelcomePage';
import { LoginPage } from '../pages/auth/LoginPage';
import { UnauthorizedPage } from '../pages/auth/UnauthorizedPage';

import { HubListPage } from '../pages/student/HubListPage';
import { HubInfoPage } from '../pages/student/HubInfoPage';
import { HubDetailPage } from '../pages/student/HubDetailPage';
import { ParkingBookingPage } from '../pages/student/ParkingBookingPage';
import { ReservationsPage } from '../pages/student/ReservationsPage';
import { ChargingPage } from '../pages/student/ChargingPage';
import { MyVehiclesPage } from '../pages/student/MyVehiclesPage';

import { OperatorDashboardPage } from '../pages/operator/OperatorDashboardPage';
import { HubUtilizationPage } from '../pages/operator/HubUtilizationPage';
import { ManageParkingPage } from '../pages/operator/ManageParkingPage';
import { VehicleChargingStatusPage } from '../pages/operator/VehicleChargingStatusPage';
import { IncidentsPage } from '../pages/operator/IncidentsPage';
import { DispatchPage } from '../pages/operator/DispatchPage';
import { SimulationPage } from '../pages/operator/SimulationPage';
import { OperatorProfilePage } from '../pages/operator/OperatorProfilePage';

export function AppRouter() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<WelcomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />

      {/* Student / Private EV Owner Routes (Role: USER or OPERATOR — Task 3.2a by Lê Minh Nhật) */}
      <Route element={<ProtectedRoute allowedRoles={['USER', 'OPERATOR']} />}>
        <Route path="/student" element={<StudentLayout />}>
          <Route index element={<Navigate to="hubs" replace />} />
          <Route path="hubs" element={<HubListPage />} />
          <Route path="hubs/:hubId" element={<HubInfoPage />} />
          <Route path="hubs/:hubId/info" element={<HubInfoPage />} />
          <Route path="hubs/:hubId/vehicles" element={<HubDetailPage />} />
          <Route path="hubs/:hubId/parking" element={<ParkingBookingPage />} />
          <Route path="reservations" element={<ReservationsPage />} />
          <Route path="charging" element={<ChargingPage />} />
          <Route path="vehicles" element={<MyVehiclesPage />} />
        </Route>
      </Route>

      {/* Operator / Staff Routes (Role: OPERATOR — Task 3.3a & 4.1a by Mã Trần Minh Quốc) */}
      <Route element={<ProtectedRoute allowedRoles={['OPERATOR']} />}>
        <Route path="/operator" element={<OperatorLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<OperatorDashboardPage />} />
          <Route path="hub-utilization" element={<HubUtilizationPage />} />
          <Route path="manage-parking" element={<ManageParkingPage />} />
          <Route path="vehicles-charging" element={<VehicleChargingStatusPage />} />
          <Route path="incidents" element={<IncidentsPage />} />
          <Route path="dispatch" element={<DispatchPage />} />
          <Route path="simulation" element={<SimulationPage />} />
          <Route path="profile" element={<OperatorProfilePage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

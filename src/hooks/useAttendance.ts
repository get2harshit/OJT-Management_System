import { useData } from '../context/DataContext';

export function useAttendance() {
  const { attendance, addAttendance, toggleAttendance, markAllAttendance } = useData();
  return { attendance, addAttendance, toggleAttendance, markAllAttendance };
}

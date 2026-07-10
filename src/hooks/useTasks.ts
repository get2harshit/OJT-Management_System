import { useData } from '../context/DataContext';

export function useTasks() {
  const { tasks, addTask, deleteTask } = useData();
  return { tasks, addTask, deleteTask };
}

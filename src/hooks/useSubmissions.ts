import { useData } from '../context/DataContext';

export function useSubmissions() {
  const { submissions, comments, addSubmission, updateSubmissionStatus, addComment } = useData();
  return { submissions, comments, addSubmission, updateSubmissionStatus, addComment };
}

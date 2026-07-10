import { useData } from '../context/DataContext';

export function useCredits() {
  const { credits, creditRequests, addCredit, addCreditRequest, vouchCreditRequest, approveCreditRequest } = useData();
  return { credits, creditRequests, addCredit, addCreditRequest, vouchCreditRequest, approveCreditRequest };
}

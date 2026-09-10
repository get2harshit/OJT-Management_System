import { useData } from '../context/DataContext';

export function useCredits() {
  const { credits, creditRequests, partnerPools, addCredit, addCreditRequest, vouchCreditRequest, approveCreditRequest } = useData();
  return { credits, creditRequests, partnerPools, addCredit, addCreditRequest, vouchCreditRequest, approveCreditRequest };
}

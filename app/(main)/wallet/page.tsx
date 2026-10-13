import BankConnections from '@/app/ui/bankConnections';
export default function Accounts() {
  return <><div className="mb-6"><h1 className="page-title">Accounts</h1><p className="mt-2 text-sm text-off_gray">Link your banks to bring transactions into Spending.</p></div><BankConnections /></>;
}

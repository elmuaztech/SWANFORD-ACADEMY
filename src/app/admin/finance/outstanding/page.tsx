import { redirect } from 'next/navigation';

export default function AdminFinanceOutstandingRedirect() {
  redirect('/admin/finance?tab=outstanding');
}

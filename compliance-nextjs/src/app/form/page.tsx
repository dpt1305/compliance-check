import DashboardForm from '@/components/dashboard/DashboardForm';
import DynamicForm from '@/components/dashboard/DynamicForm';

export const metadata = { title: 'Submit Compliance | Compliance System' };

export default function FormPage() {
  const useDynamic = process.env.ENABLE_DYNAMIC_FORM === 'true';
  return useDynamic ? <DynamicForm /> : <DashboardForm />;
}

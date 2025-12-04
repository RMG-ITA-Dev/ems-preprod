import { AppLayout } from "@/components/layout/AppLayout";
import { ClientForm } from "@/components/forms/ClientForm";

const ClientNew = () => {
  return (
    <AppLayout title="Clients">
      <ClientForm />
    </AppLayout>
  );
};

export default ClientNew;

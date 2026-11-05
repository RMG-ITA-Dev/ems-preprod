import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";

import { useClients, useClientDirectory, useEngagements, useIndustries, Client } from "@/hooks/useEmsData";
import { DataTable, Column } from "@/components/data-table/DataTable";
import { useNavigate } from "react-router-dom";
import { formatFiscalYearEnd } from "@/lib/fiscalYearDisplay";
import { useAuthorization } from "@/hooks/useAuthorization";
import { useCanSeeAllEngagements } from "@/hooks/useCanSeeAllEngagements";
import { byNameAndTaxId, findRepeated, orderHomonymsBySeq } from "@/lib/clientLabels";
import { ClientHomonymTag } from "@/components/clients/ClientHomonymTag";

const Clients = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { can } = useAuthorization();
  const canCreate = can("client.create");
  const { data: clients, isLoading } = useClients();
  const { data: engagements } = useEngagements();
  // B3c: useEngagements() devuelve solo los encargos que la RLS deja ver; el conteo por cliente solo es real si el
  // usuario los lee todos (un gerente ve únicamente los suyos y subcontaría los demás del mismo cliente).
  const canSeeAllEngagements = useCanSeeAllEngagements();
  const { data: industries } = useIndustries();
  // 1028-211: razón social y NIT pueden repetirse (ETL 02). La lista ya muestra el NIT, así que el
  // número de homónimo solo hace falta cuando coinciden los dos: ahí las filas serían idénticas. QUÉ
  // filas lo llevan se decide sobre la colección cargada (antes de los filtros del DataTable); el
  // NÚMERO viene del directorio, que lo calcula sobre toda la firma, para que coincida con el que se
  // ve en el selector de Nuevo Encargo.
  const { data: directory } = useClientDirectory();
  const repeatedIds = useMemo(() => findRepeated(clients ?? [], byNameAndTaxId), [clients]);
  const homonymSeqById = useMemo(
    () => new Map((directory ?? []).map((entry) => [entry.client_id, entry.homonym_seq])),
    [directory],
  );
  const homonymSeqOf = (clientId: string) => (repeatedIds.has(clientId) ? homonymSeqById.get(clientId) ?? null : null);
  // Entre nombres iguales el orden de la consulta es arbitrario: #1 antes que #2.
  const orderedClients = useMemo(
    () => orderHomonymsBySeq(clients ?? [], (client) => homonymSeqById.get(client.client_id)),
    [clients, homonymSeqById],
  );

  const getEngagementCount = (clientId: string) => {
    return engagements?.filter((e) => e.client_id === clientId).length || 0;
  };

  const industryOptions = (industries || []).map((ind) => ({
    value: ind.industry_id,
    label: ind.industry_name,
  }));

  const columns: Column<Client>[] = [
    {
      key: "client_legal_name",
      label: t("client.name"),
      sortable: true,
      mobilePriority: 'primary',
      render: (row) => (
        <span className="font-medium">
          {row.client_legal_name}
          {homonymSeqOf(row.client_id) !== null && (
            <ClientHomonymTag seq={homonymSeqOf(row.client_id)!} className="ml-2" />
          )}
        </span>
      ),
    },
    {
      key: "tax_id",
      label: t("client.nit"),
      sortable: true,
      mobilePriority: 'secondary',
      render: (row) => <span className="text-muted-foreground">{row.tax_id || "-"}</span>,
    },
    {
      key: "industry.industry_name",
      label: t("client.industry"),
      sortable: true,
      filterKey: "industry_id",
      mobilePriority: 'primary',
      render: (row) => row.industry?.industry_name || "-",
    },
    {
      // Cobranzas Fase 5: el contacto salió de la ficha y ahora hay dos tipos. La lista
      // muestra el GENERAL, que es el que tenía antes; el de cobranza se ve en la ficha y en
      // el plan de pagos, que es donde se usa.
      key: "contact_name",
      label: t("client.contact"),
      sortable: true,
      mobilePriority: 'secondary',
      render: (row) =>
        (row.contacts ?? []).find((c) => c.contact_type === "general" && c.is_active)?.full_name || "-",
    },
    {
      key: "industry.fiscal_year_end",
      label: t("client.closingDate"),
      sortable: true,
      mobilePriority: 'secondary',
      className: "text-center",
      render: (row) => (
        <span className="text-muted-foreground">
          {formatFiscalYearEnd(row.industry?.fiscal_year_end, i18n.language)}
        </span>
      ),
    },
    {
      key: "is_active",
      label: t("client.status"),
      sortable: true,
      filterKey: "is_active",
      mobilePriority: 'primary',
      render: (row) => (
        <Badge
          variant="outline"
          className={row.is_active ? "bg-success/10 text-success border-success/20" : "bg-muted text-muted-foreground"}
        >
          {row.is_active ? t("status.active") : t("status.inactive")}
        </Badge>
      ),
    },
    {
      key: "engagements",
      label: t("client.engagements"),
      className: "text-center w-28",
      mobilePriority: 'secondary',
      render: (row) =>
        canSeeAllEngagements ? (
          <Badge variant="secondary">{getEngagementCount(row.client_id)}</Badge>
        ) : (
          <span className="text-muted-foreground" title={t("client.engagementsHidden")}>-</span>
        ),
    },
  ];

  return (
    <AppLayout title={t("nav.clients")}>
      <DataTable
        data={orderedClients}
        columns={columns}
        searchPlaceholder={t("client.searchPlaceholder")}
        searchKeys={["client_legal_name", "tax_id"]}
        isLoading={isLoading}
        newButtonLabel={canCreate ? t("client.newClient") : undefined}
        onNewClick={canCreate ? () => navigate("/clients/new") : undefined}
        onRowClick={(row) => navigate(`/clients/${row.client_id}`)}
        getRowId={(row) => row.client_id}
        filters={[
          {
            key: "industry_id",
            label: t("client.industry"),
            options: industryOptions,
          },
        ]}
        statusFilter={{
          key: "is_active",
          options: [
            { value: "active", label: t("status.active") },
            { value: "inactive", label: t("status.inactive") },
          ],
        }}
      />
    </AppLayout>
  );
};

export default Clients;

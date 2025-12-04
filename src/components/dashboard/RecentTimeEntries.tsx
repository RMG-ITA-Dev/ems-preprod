import { Clock } from "lucide-react";

interface TimeEntry {
  id: string;
  date: string;
  hours: number;
  engagement: string;
  activity: string;
}

interface RecentTimeEntriesProps {
  entries: TimeEntry[];
}

export function RecentTimeEntries({ entries }: RecentTimeEntriesProps) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("es-BO", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  return (
    <div className="bg-card rounded-xl border border-border animate-fade-in">
      <div className="p-5 border-b border-border">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Clock className="h-4 w-4 text-accent" />
          Recent Time Entries
        </h3>
      </div>
      <div className="divide-y divide-border">
        {entries.map((entry) => (
          <div key={entry.id} className="p-4 hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground text-sm">{entry.engagement}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{entry.activity}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-foreground">{entry.hours}h</p>
                <p className="text-xs text-muted-foreground">{formatDate(entry.date)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

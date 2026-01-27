import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface StatsCardProps {
  title: string;
  icon: ReactNode;
  value: string | number | ReactNode;
  subValue?: ReactNode;
  loading?: boolean;
  className?: string;
}

export function StatsCard({ 
  title, 
  icon, 
  value, 
  subValue, 
  loading = false,
  className
}: StatsCardProps) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="h-4 w-4 text-muted-foreground">
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-[100px]" />
            <Skeleton className="h-4 w-[60px]" />
          </div>
        ) : (
          <>
            <div className="text-2xl font-bold tracking-tight">{value}</div>
            {subValue && (
              <p className="text-xs text-muted-foreground mt-1">
                {subValue}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
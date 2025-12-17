import React from 'react';
import { cn } from '@/lib/utils';

export default function StatCard({ title, value, icon: Icon, trend, className }) {
  return (
    <div className={cn(
      "bg-white rounded-xl sm:rounded-2xl p-3 sm:p-6 border border-stone-200 shadow-sm hover:shadow-md transition-shadow",
      className
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] sm:text-xs uppercase tracking-wider text-stone-500 font-medium mb-1 sm:mb-2 truncate">{title}</p>
          <p className="text-lg sm:text-2xl font-semibold text-stone-900 truncate">{value}</p>
          {trend && (
            <p className={cn(
              "text-[10px] sm:text-xs mt-1 sm:mt-2 font-medium",
              trend > 0 ? "text-emerald-700" : "text-rose-700"
            )}>
              {trend > 0 ? '+' : ''}{trend}%
            </p>
          )}
        </div>
        {Icon && (
          <div className="p-2 sm:p-3 bg-stone-800 rounded-lg sm:rounded-xl flex-shrink-0">
            <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>
        )}
      </div>
    </div>
  );
}
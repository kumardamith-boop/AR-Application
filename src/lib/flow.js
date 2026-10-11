import { day, todayLK } from './format.js';

/** Is this collection waiting on the current user? Drives the "For you" tab. */
export function waitingOnMe(c, { role, uid, settings, isAdmin }, replacedIds) {
  const splitPending = c.split_needed && !c.split_at;
  switch (role) {
    case 'finance':
      return c.status === 'submitted' || (c.status === 'collected' && !splitPending) || c.status === 'received' || c.status === 'deposited';
    case 'driver':
      return (c.status === 'assigned' && (c.driver_id === uid || isAdmin))
        || (settings?.drivers_can_deposit && c.status === 'collected' && c.driver_id === uid);
    case 'sales': {
      const mine = c.created_by === uid || isAdmin;
      if (!mine) return false;
      if (splitPending && ['collected', 'received', 'deposited', 'closed'].includes(c.status)) return true;
      return c.status === 'returned' && !replacedIds?.has(c.id);
    }
    default:
      return false;
  }
}

export function nextStep(c, nameOf, replacedBy) {
  const splitPending = c.split_needed && !c.split_at;
  switch (c.status) {
    case 'submitted':
      return 'Finance to assign a driver';
    case 'assigned': {
      const late = c.collection_date && c.collection_date < todayLK();
      return `${nameOf(c.driver_id)}, ${day(c.collection_date)}${late ? ' (overdue)' : ''}`;
    }
    case 'collected':
      return splitPending ? 'Say which invoices each cheque pays' : `Finance to receive from ${nameOf(c.driver_id) || 'the driver'}`;
    case 'received':
      return splitPending ? 'To deposit (split still needed)' : 'Finance to deposit';
    case 'deposited':
      return 'Waiting for the bank statement';
    case 'closed':
      return splitPending ? 'Closed, split still needed for BC' : `In the bank, ${day(c.closed_at)}`;
    case 'cancelled':
      return c.cancel_reason ? `Cancelled: ${c.cancel_reason}` : 'Cancelled';
    case 'returned':
      return replacedBy ? `Replaced by ${replacedBy}` : 'Raise a replacement';
    default:
      return '';
  }
}

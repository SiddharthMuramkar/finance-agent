// The month names a date is written with, one table for the Widgets and the app.
// Read by index from a date's month number, 1 to 12, minus one.

/** "Jan" to "Dec": three letters, never Intl's "Sept". */
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** "January" to "December". */
export const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;

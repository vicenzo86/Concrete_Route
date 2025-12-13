
import { createClient } from '@supabase/supabase-js';

// Substitua com suas credenciais reais do Supabase Dashboard
const supabaseUrl = 'https://pyrrcfbgwpncljxyyozd.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5cnJjZmJnd3BuY2xqeHl5b3pkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU2NDYxOTIsImV4cCI6MjA4MTIyMjE5Mn0._0Hxke_9Pu9TT8QkAIcvtWlSAV1BocCdGzowGb_cGug';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

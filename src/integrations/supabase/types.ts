export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action_type: string
          actor_id: string | null
          candidate_id: string | null
          created_at: string
          from_value: string | null
          id: string
          job_candidate_id: string | null
          job_id: string | null
          metadata: Json
          to_value: string | null
          workspace_id: string
        }
        Insert: {
          action_type: string
          actor_id?: string | null
          candidate_id?: string | null
          created_at?: string
          from_value?: string | null
          id?: string
          job_candidate_id?: string | null
          job_id?: string | null
          metadata?: Json
          to_value?: string | null
          workspace_id: string
        }
        Update: {
          action_type?: string
          actor_id?: string | null
          candidate_id?: string | null
          created_at?: string
          from_value?: string | null
          id?: string
          job_candidate_id?: string | null
          job_id?: string | null
          metadata?: Json
          to_value?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      candidate_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          job_candidate_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          job_candidate_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          job_candidate_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_comments_job_candidate_id_fkey"
            columns: ["job_candidate_id"]
            isOneToOne: false
            referencedRelation: "job_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_documents: {
        Row: {
          candidate_id: string
          category: string
          created_at: string
          file_path: string | null
          id: string
          job_candidate_id: string
          kind: string
          mime_type: string | null
          name: string
          size_bytes: number | null
          uploaded_by: string
          url: string | null
          workspace_id: string
        }
        Insert: {
          candidate_id: string
          category?: string
          created_at?: string
          file_path?: string | null
          id?: string
          job_candidate_id: string
          kind: string
          mime_type?: string | null
          name: string
          size_bytes?: number | null
          uploaded_by: string
          url?: string | null
          workspace_id: string
        }
        Update: {
          candidate_id?: string
          category?: string
          created_at?: string
          file_path?: string | null
          id?: string
          job_candidate_id?: string
          kind?: string
          mime_type?: string | null
          name?: string
          size_bytes?: number | null
          uploaded_by?: string
          url?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      candidate_tags: {
        Row: {
          candidate_id: string
          created_at: string
          created_by: string
          id: string
          tag: string
          workspace_id: string
        }
        Insert: {
          candidate_id: string
          created_at?: string
          created_by: string
          id?: string
          tag: string
          workspace_id: string
        }
        Update: {
          candidate_id?: string
          created_at?: string
          created_by?: string
          id?: string
          tag?: string
          workspace_id?: string
        }
        Relationships: []
      }
      candidates: {
        Row: {
          anonymized_resume_summary: string | null
          archived: boolean
          archived_at: string | null
          archived_by: string | null
          created_at: string
          created_by: string
          email: string | null
          full_name: string
          headline: string | null
          id: string
          linkedin_url: string | null
          location: string | null
          notes: string | null
          phone: string | null
          redacted_resume_path: string | null
          redaction_rects: Json
          referrer_name: string | null
          resume_full_text: string | null
          resume_path: string | null
          resume_summary: string | null
          resume_summary_generated_at: string | null
          source: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          anonymized_resume_summary?: string | null
          archived?: boolean
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by: string
          email?: string | null
          full_name: string
          headline?: string | null
          id?: string
          linkedin_url?: string | null
          location?: string | null
          notes?: string | null
          phone?: string | null
          redacted_resume_path?: string | null
          redaction_rects?: Json
          referrer_name?: string | null
          resume_full_text?: string | null
          resume_path?: string | null
          resume_summary?: string | null
          resume_summary_generated_at?: string | null
          source?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          anonymized_resume_summary?: string | null
          archived?: boolean
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string
          email?: string | null
          full_name?: string
          headline?: string | null
          id?: string
          linkedin_url?: string | null
          location?: string | null
          notes?: string | null
          phone?: string | null
          redacted_resume_path?: string | null
          redaction_rects?: Json
          referrer_name?: string | null
          resume_full_text?: string | null
          resume_path?: string | null
          resume_summary?: string | null
          resume_summary_generated_at?: string | null
          source?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contacts: {
        Row: {
          client_id: string
          created_at: string
          email: string | null
          id: string
          is_primary: boolean
          name: string
          phone: string | null
          title: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          name: string
          phone?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          name?: string
          phone?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          created_at: string
          created_by: string
          id: string
          industry: string | null
          name: string
          notes: string | null
          updated_at: string
          website: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          industry?: string | null
          name: string
          notes?: string | null
          updated_at?: string
          website?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          industry?: string | null
          name?: string
          notes?: string | null
          updated_at?: string
          website?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_mentions: {
        Row: {
          comment_id: string
          created_at: string
          mentioned_user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          mentioned_user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          mentioned_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_mentions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "candidate_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_threads: {
        Row: {
          candidate_id: string | null
          channel: string
          contact_id: string | null
          created_at: string
          created_by: string
          id: string
          job_candidate_id: string | null
          last_message_at: string
          last_message_preview: string | null
          participant_email: string | null
          participant_name: string | null
          reply_to_token: string
          status: string
          subject: string
          unread_count: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          candidate_id?: string | null
          channel?: string
          contact_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          job_candidate_id?: string | null
          last_message_at?: string
          last_message_preview?: string | null
          participant_email?: string | null
          participant_name?: string | null
          reply_to_token?: string
          status?: string
          subject?: string
          unread_count?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          candidate_id?: string | null
          channel?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          job_candidate_id?: string | null
          last_message_at?: string
          last_message_preview?: string | null
          participant_email?: string | null
          participant_name?: string | null
          reply_to_token?: string
          status?: string
          subject?: string
          unread_count?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      guest_job_submissions: {
        Row: {
          apply_url: string | null
          category: string | null
          created_at: string
          description: string | null
          employment_type: string | null
          id: string
          location: string | null
          payment_provider: string | null
          payment_reference: string | null
          payment_status: string
          poster_company: string | null
          poster_email: string
          poster_name: string
          poster_phone: string | null
          published_at: string | null
          published_job_id: string | null
          remote_policy: string | null
          review_token: string
          salary_max: number | null
          salary_min: number | null
          status: string
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          apply_url?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          employment_type?: string | null
          id?: string
          location?: string | null
          payment_provider?: string | null
          payment_reference?: string | null
          payment_status?: string
          poster_company?: string | null
          poster_email: string
          poster_name: string
          poster_phone?: string | null
          published_at?: string | null
          published_job_id?: string | null
          remote_policy?: string | null
          review_token?: string
          salary_max?: number | null
          salary_min?: number | null
          status?: string
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          apply_url?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          employment_type?: string | null
          id?: string
          location?: string | null
          payment_provider?: string | null
          payment_reference?: string | null
          payment_status?: string
          poster_company?: string | null
          poster_email?: string
          poster_name?: string
          poster_phone?: string | null
          published_at?: string | null
          published_job_id?: string | null
          remote_policy?: string | null
          review_token?: string
          salary_max?: number | null
          salary_min?: number | null
          status?: string
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      interview_feedback: {
        Row: {
          author_id: string
          concerns: string | null
          created_at: string
          id: string
          job_candidate_id: string
          notes: string | null
          rating: number | null
          recommendation:
            | Database["public"]["Enums"]["feedback_recommendation"]
            | null
          strengths: string | null
          updated_at: string
        }
        Insert: {
          author_id: string
          concerns?: string | null
          created_at?: string
          id?: string
          job_candidate_id: string
          notes?: string | null
          rating?: number | null
          recommendation?:
            | Database["public"]["Enums"]["feedback_recommendation"]
            | null
          strengths?: string | null
          updated_at?: string
        }
        Update: {
          author_id?: string
          concerns?: string | null
          created_at?: string
          id?: string
          job_candidate_id?: string
          notes?: string | null
          rating?: number | null
          recommendation?:
            | Database["public"]["Enums"]["feedback_recommendation"]
            | null
          strengths?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_feedback_job_candidate_id_fkey"
            columns: ["job_candidate_id"]
            isOneToOne: false
            referencedRelation: "job_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_recordings: {
        Row: {
          ai_summary: Json | null
          created_at: string
          created_by: string
          id: string
          interview_id: string
          transcript: string | null
          updated_at: string
          video_url: string | null
        }
        Insert: {
          ai_summary?: Json | null
          created_at?: string
          created_by: string
          id?: string
          interview_id: string
          transcript?: string | null
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          ai_summary?: Json | null
          created_at?: string
          created_by?: string
          id?: string
          interview_id?: string
          transcript?: string | null
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interview_recordings_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interview_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_schedules: {
        Row: {
          created_at: string
          created_by: string
          duration_minutes: number
          id: string
          interviewer_ids: string[]
          job_candidate_id: string
          schedule_token: string
          scheduled_at: string | null
          stage_id: string | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          duration_minutes?: number
          id?: string
          interviewer_ids?: string[]
          job_candidate_id: string
          schedule_token?: string
          scheduled_at?: string | null
          stage_id?: string | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          duration_minutes?: number
          id?: string
          interviewer_ids?: string[]
          job_candidate_id?: string
          schedule_token?: string
          scheduled_at?: string | null
          stage_id?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      interview_scorecards: {
        Row: {
          created_at: string
          id: string
          interview_id: string
          interviewer_id: string
          notes: string | null
          overall_recommendation: string | null
          ratings: Json
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          interview_id: string
          interviewer_id: string
          notes?: string | null
          overall_recommendation?: string | null
          ratings?: Json
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          interview_id?: string
          interviewer_id?: string
          notes?: string | null
          overall_recommendation?: string | null
          ratings?: Json
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_scorecards_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interview_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      interviewer_availability: {
        Row: {
          buffer_minutes: number
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          start_time: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          buffer_minutes?: number
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          start_time: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          buffer_minutes?: number
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          start_time?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      job_application_questions: {
        Row: {
          created_at: string
          fail_value: string | null
          id: string
          is_knockout: boolean
          job_id: string
          options: string[] | null
          position: number
          question_text: string
          rejection_template_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          fail_value?: string | null
          id?: string
          is_knockout?: boolean
          job_id: string
          options?: string[] | null
          position?: number
          question_text: string
          rejection_template_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          fail_value?: string | null
          id?: string
          is_knockout?: boolean
          job_id?: string
          options?: string[] | null
          position?: number
          question_text?: string
          rejection_template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_application_questions_rejection_template_id_fkey"
            columns: ["rejection_template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      job_approval_steps: {
        Row: {
          approver_id: string
          created_at: string
          decided_at: string | null
          id: string
          job_id: string
          note: string | null
          status: string
          step_order: number
          token: string | null
          token_expires_at: string | null
        }
        Insert: {
          approver_id: string
          created_at?: string
          decided_at?: string | null
          id?: string
          job_id: string
          note?: string | null
          status?: string
          step_order: number
          token?: string | null
          token_expires_at?: string | null
        }
        Update: {
          approver_id?: string
          created_at?: string
          decided_at?: string | null
          id?: string
          job_id?: string
          note?: string | null
          status?: string
          step_order?: number
          token?: string | null
          token_expires_at?: string | null
        }
        Relationships: []
      }
      job_candidates: {
        Row: {
          added_by: string
          anonymized: boolean
          candidate_id: string
          created_at: string
          id: string
          job_id: string
          match_breakdown: Json | null
          match_generated_at: string | null
          match_rationale: string | null
          match_score: number | null
          match_verdict: string | null
          position: number
          rejected: boolean
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          stage: string
          updated_at: string
        }
        Insert: {
          added_by: string
          anonymized?: boolean
          candidate_id: string
          created_at?: string
          id?: string
          job_id: string
          match_breakdown?: Json | null
          match_generated_at?: string | null
          match_rationale?: string | null
          match_score?: number | null
          match_verdict?: string | null
          position?: number
          rejected?: boolean
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          stage?: string
          updated_at?: string
        }
        Update: {
          added_by?: string
          anonymized?: boolean
          candidate_id?: string
          created_at?: string
          id?: string
          job_id?: string
          match_breakdown?: Json | null
          match_generated_at?: string | null
          match_rationale?: string | null
          match_score?: number | null
          match_verdict?: string | null
          position?: number
          rejected?: boolean
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_candidates_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_candidates_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_hiring_managers: {
        Row: {
          contact_id: string
          created_at: string
          job_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          job_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          job_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_hiring_managers_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "client_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_hiring_managers_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          application_form_config: Json
          approval_decided_at: string | null
          approval_note: string | null
          approval_requested_from: string | null
          approval_status: string
          approved_by: string | null
          client_id: string
          created_at: string
          created_by: string
          description: string | null
          employment_type: string | null
          id: string
          interview_competencies: Json
          location: string | null
          marketplace_category: string | null
          marketplace_published_at: string | null
          marketplace_status: string
          marketplace_summary: string | null
          reference: string | null
          remote_policy: string | null
          salary_max: number | null
          salary_min: number | null
          status: Database["public"]["Enums"]["job_status"]
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          application_form_config?: Json
          approval_decided_at?: string | null
          approval_note?: string | null
          approval_requested_from?: string | null
          approval_status?: string
          approved_by?: string | null
          client_id: string
          created_at?: string
          created_by: string
          description?: string | null
          employment_type?: string | null
          id?: string
          interview_competencies?: Json
          location?: string | null
          marketplace_category?: string | null
          marketplace_published_at?: string | null
          marketplace_status?: string
          marketplace_summary?: string | null
          reference?: string | null
          remote_policy?: string | null
          salary_max?: number | null
          salary_min?: number | null
          status?: Database["public"]["Enums"]["job_status"]
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          application_form_config?: Json
          approval_decided_at?: string | null
          approval_note?: string | null
          approval_requested_from?: string | null
          approval_status?: string
          approved_by?: string | null
          client_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          employment_type?: string | null
          id?: string
          interview_competencies?: Json
          location?: string | null
          marketplace_category?: string | null
          marketplace_published_at?: string | null
          marketplace_status?: string
          marketplace_summary?: string | null
          reference?: string | null
          remote_policy?: string | null
          salary_max?: number | null
          salary_min?: number | null
          status?: Database["public"]["Enums"]["job_status"]
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachments: Json
          body: string
          body_html: string | null
          created_at: string
          direction: string
          id: string
          read_at: string | null
          recipient_email: string | null
          sender_email: string | null
          sender_name: string | null
          sender_user_id: string | null
          thread_id: string
          workspace_id: string
        }
        Insert: {
          attachments?: Json
          body?: string
          body_html?: string | null
          created_at?: string
          direction?: string
          id?: string
          read_at?: string | null
          recipient_email?: string | null
          sender_email?: string | null
          sender_name?: string | null
          sender_user_id?: string | null
          thread_id: string
          workspace_id: string
        }
        Update: {
          attachments?: Json
          body?: string
          body_html?: string | null
          created_at?: string
          direction?: string
          id?: string
          read_at?: string | null
          recipient_email?: string | null
          sender_email?: string | null
          sender_name?: string | null
          sender_user_id?: string | null
          thread_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "communication_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          payload: Json
          read_at: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          payload?: Json
          read_at?: string | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          read_at?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      offers: {
        Row: {
          bonus: string | null
          candidate_id: string
          created_at: string
          created_by: string
          decided_at: string | null
          decline_reason: string | null
          equity: string | null
          id: string
          internal_approved_at: string | null
          internal_approved_by: string | null
          job_candidate_id: string
          job_id: string
          notes: string | null
          public_token: string
          salary_amount: number | null
          salary_currency: string | null
          sent_at: string | null
          start_date: string | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          bonus?: string | null
          candidate_id: string
          created_at?: string
          created_by: string
          decided_at?: string | null
          decline_reason?: string | null
          equity?: string | null
          id?: string
          internal_approved_at?: string | null
          internal_approved_by?: string | null
          job_candidate_id: string
          job_id: string
          notes?: string | null
          public_token?: string
          salary_amount?: number | null
          salary_currency?: string | null
          sent_at?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          bonus?: string | null
          candidate_id?: string
          created_at?: string
          created_by?: string
          decided_at?: string | null
          decline_reason?: string | null
          equity?: string | null
          id?: string
          internal_approved_at?: string | null
          internal_approved_by?: string | null
          job_candidate_id?: string
          job_id?: string
          notes?: string | null
          public_token?: string
          salary_amount?: number | null
          salary_currency?: string | null
          sent_at?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      outbound_email_queue: {
        Row: {
          attempts: number
          candidate_id: string | null
          created_at: string
          created_by: string | null
          id: string
          job_candidate_id: string | null
          last_error: string | null
          payload: Json
          scheduled_at: string
          sent_at: string | null
          status: string
          template_id: string | null
          workspace_id: string
        }
        Insert: {
          attempts?: number
          candidate_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          job_candidate_id?: string | null
          last_error?: string | null
          payload?: Json
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          template_id?: string | null
          workspace_id: string
        }
        Update: {
          attempts?: number
          candidate_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          job_candidate_id?: string | null
          last_error?: string | null
          payload?: Json
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          template_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outbound_email_queue_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      stage_triggers: {
        Row: {
          created_at: string
          created_by: string
          delay_minutes: number
          enabled: boolean
          id: string
          settings: Json
          stage_id: string
          template_id: string | null
          trigger_type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          delay_minutes?: number
          enabled?: boolean
          id?: string
          settings?: Json
          stage_id: string
          template_id?: string | null
          trigger_type: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          delay_minutes?: number
          enabled?: boolean
          id?: string
          settings?: Json
          stage_id?: string
          template_id?: string | null
          trigger_type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_triggers_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "workspace_pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_triggers_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          content: string
          created_at: string
          created_by: string
          id: string
          name: string
          type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          created_by: string
          id?: string
          name: string
          type: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      workspace_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["workspace_role"]
          status: string
          token: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          role?: Database["public"]["Enums"]["workspace_role"]
          status?: string
          token?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          status?: string
          token?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invites_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_pipeline_stages: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          key: string
          label: string
          position: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          key: string
          label: string
          position?: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          key?: string
          label?: string
          position?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_pipeline_stages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invite: { Args: { _token: string }; Returns: string }
      can_edit_workspace: {
        Args: { _uid: string; _workspace_id: string }
        Returns: boolean
      }
      can_view_client: {
        Args: { _client_id: string; _uid: string }
        Returns: boolean
      }
      create_workspace: { Args: { _name: string }; Returns: string }
      generate_job_reference: {
        Args: { _client_id: string; _workspace_id: string }
        Returns: string
      }
      get_invite_by_token: {
        Args: { _token: string }
        Returns: {
          email: string
          expires_at: string
          id: string
          role: Database["public"]["Enums"]["workspace_role"]
          status: string
          workspace_id: string
          workspace_name: string
        }[]
      }
      get_offer_by_token: {
        Args: { _token: string }
        Returns: {
          bonus: string
          candidate_name: string
          client_name: string
          decided_at: string
          equity: string
          id: string
          job_title: string
          notes: string
          salary_amount: number
          salary_currency: string
          sent_at: string
          start_date: string
          status: string
        }[]
      }
      has_workspace_role: {
        Args: {
          _role: Database["public"]["Enums"]["workspace_role"]
          _user_id: string
          _workspace_id: string
        }
        Returns: boolean
      }
      is_assigned_hiring_manager: {
        Args: { _job_id: string; _uid: string }
        Returns: boolean
      }
      is_linked_hiring_manager: {
        Args: { _client_id: string; _uid: string }
        Returns: boolean
      }
      is_non_hm_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      job_reference_prefix: { Args: { _client_name: string }; Returns: string }
      respond_offer: {
        Args: { _accept: boolean; _reason?: string; _token: string }
        Returns: Json
      }
      user_workspace_role: {
        Args: { _uid: string; _workspace_id: string }
        Returns: Database["public"]["Enums"]["workspace_role"]
      }
    }
    Enums: {
      feedback_recommendation: "strong_yes" | "yes" | "no" | "strong_no"
      job_status: "open" | "on_hold" | "closed" | "filled"
      pipeline_stage:
        | "application"
        | "sourced"
        | "contacted"
        | "screened"
        | "interview"
        | "offer"
        | "hired"
        | "rejected"
      workspace_role: "owner" | "recruiter" | "viewer" | "hiring_manager"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      feedback_recommendation: ["strong_yes", "yes", "no", "strong_no"],
      job_status: ["open", "on_hold", "closed", "filled"],
      pipeline_stage: [
        "application",
        "sourced",
        "contacted",
        "screened",
        "interview",
        "offer",
        "hired",
        "rejected",
      ],
      workspace_role: ["owner", "recruiter", "viewer", "hiring_manager"],
    },
  },
} as const

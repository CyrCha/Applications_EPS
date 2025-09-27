"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo:
            typeof window !== "undefined"
              ? `${window.location.origin}/dashboard`
              : undefined,
        },
      });
      if (error) throw error;
      setMessage(
        "Un lien magique vous a été envoyé par e-mail. Veuillez vérifier votre boîte de réception."
      );
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
      else setError("Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <h1 className="text-2xl font-semibold">Connexion professeur</h1>
        <p className="text-sm text-gray-500">
          Entrez votre e-mail. Nous vous enverrons un lien magique pour vous
          connecter.
        </p>
        <form onSubmit={onSubmit} className="space-y-4">
          <Input
            type="email"
            required
            placeholder="votre.email@ecole.fr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Envoi..." : "Envoyer le lien"}
          </Button>
        </form>
        {message && (
          <div className="text-green-600 text-sm" role="status">
            {message}
          </div>
        )}
        {error && (
          <div className="text-red-600 text-sm" role="alert">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

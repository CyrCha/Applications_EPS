import { Button } from "@/components/Button";

export default function Home() {
  return (
    <div className="min-h-screen p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold">Rendez-vous Parents–Professeurs</h1>
          <p className="text-gray-600">
            Créez des événements de RDV, partagez un lien public et laissez les parents réserver un créneau.
          </p>
        </header>
        <nav className="flex gap-3">
          <Button href="/auth" variant="primary">Connexion professeur</Button>
          <Button href="/dashboard" variant="secondary">Tableau de bord</Button>
        </nav>
        <section className="rounded-md border p-4">
          <h2 className="font-medium mb-2">Fonctionnalités</h2>
          <ul className="list-disc pl-6 text-sm text-gray-700 space-y-1">
            <li>Connexion par lien magique (professeurs)</li>
            <li>Création d’événements et génération automatique des créneaux</li>
            <li>Capacité multiple par créneau (ex: 2 parents au même horaire) avec ajustement +1/-1</li>
            <li>Page publique: affichage des places restantes par créneau</li>
            <li>Page Gérer: badge remplissage par groupe + pastille « Détails » (nom/email/date) + annulation par réservation</li>
            <li>ICS: ajout du rendez-vous au calendrier après réservation</li>
            <li>Déploiement Netlify (plugin Next.js officiel)</li>
          </ul>
        </section>
      </div>
    </div>
  );
}

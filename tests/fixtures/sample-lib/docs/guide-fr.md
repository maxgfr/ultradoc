# Guide d'utilisation (FR)

Ce guide décrit le comportement de la bibliothèque en français.

## Stratégie de réessai

Quand une réponse échoue de manière transitoire, la bibliothèque réessaie
automatiquement l'appel. Le délai entre les réessais double à chaque tentative,
plafonné par la configuration, avec une gigue aléatoire pour éviter des rafales
synchronisées depuis plusieurs machines.

Seules les pannes transitoires sont réessayées : erreurs réseau,
réponses `429` (limitation de débit) et `5xx`. Les autres `4xx` sont
considérées comme permanentes.

## Journalisation

Chaque tentative est journalisée avec son numéro et le délai appliqué, ce qui
facilite le diagnostic des ralentissements.

import React from 'react';
import EditInvestment from './EditInvestment';

export default async function InvestmentEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditInvestment id={id} />;
}

#!/usr/bin/env python3
"""
GHL CLI — Manage your GoHighLevel pipeline from the command line.

Pipeline: Warmed Up → Replying → Meetings → Paid
"""

import json
import sys

import click
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.columns import Columns
from rich.text import Text

import api
from config import PIPELINE_STAGES, GHL_API_KEY, GHL_PIPELINE_ID

console = Console()


def check_api_key():
    if not GHL_API_KEY:
        console.print("[red]Error:[/] GHL_API_KEY not set. Copy .env.example to .env and add your key.")
        sys.exit(1)


# ── Main CLI Group ────────────────────────────────────────────────────

@click.group()
@click.version_option(version="1.0.0")
def cli():
    """GHL CLI — Manage your GoHighLevel sales pipeline.

    Pipeline stages: Warmed Up → Replying → Meetings → Paid
    """
    pass


# ── Pipeline Commands ─────────────────────────────────────────────────

@cli.group()
def pipeline():
    """View and manage pipeline stages."""
    pass


@pipeline.command("stages")
@click.option("--json-output", "-j", is_flag=True, help="Output as JSON")
def pipeline_stages(json_output):
    """List all pipeline stages."""
    check_api_key()
    try:
        stages = api.get_pipeline_stages()
        if json_output:
            click.echo(json.dumps(stages, indent=2))
            return
        table = Table(title="Pipeline Stages")
        table.add_column("#", style="dim")
        table.add_column("Stage", style="bold cyan")
        table.add_column("ID", style="dim")
        for i, stage in enumerate(stages, 1):
            table.add_row(str(i), stage.get("name", ""), stage.get("id", ""))
        console.print(table)
    except Exception as e:
        console.print(f"[red]Error:[/] {e}")


@pipeline.command("view")
@click.option("--json-output", "-j", is_flag=True, help="Output as JSON")
def pipeline_view(json_output):
    """Show pipeline overview with opportunity counts per stage."""
    check_api_key()
    try:
        stages = api.get_pipeline_stages()
        opps = api.get_opportunities(limit=100)

        stage_counts = {}
        stage_values = {}
        for opp in opps:
            sid = opp.get("pipelineStageId", "")
            stage_counts[sid] = stage_counts.get(sid, 0) + 1
            stage_values[sid] = stage_values.get(sid, 0) + opp.get("monetaryValue", 0)

        if json_output:
            result = []
            for stage in stages:
                sid = stage["id"]
                result.append({
                    "name": stage["name"],
                    "id": sid,
                    "count": stage_counts.get(sid, 0),
                    "value": stage_values.get(sid, 0),
                })
            click.echo(json.dumps(result, indent=2))
            return

        panels = []
        for stage in stages:
            sid = stage["id"]
            count = stage_counts.get(sid, 0)
            value = stage_values.get(sid, 0)
            content = f"[bold]{count}[/] contacts\n[green]${value:,.0f}[/] value"
            panels.append(Panel(content, title=f"[cyan]{stage['name']}[/]", width=20))

        console.print()
        console.print(Columns(panels, equal=True, expand=True))
        console.print()
    except Exception as e:
        console.print(f"[red]Error:[/] {e}")


# ── Contact Commands ──────────────────────────────────────────────────

@cli.group()
def contacts():
    """Search, create, and manage contacts."""
    pass


@contacts.command("list")
@click.option("--query", "-q", default="", help="Search by name, email, or phone")
@click.option("--limit", "-l", default=20, help="Max results")
@click.option("--json-output", "-j", is_flag=True, help="Output as JSON")
def contacts_list(query, limit, json_output):
    """List or search contacts."""
    check_api_key()
    try:
        results = api.search_contacts(query=query, limit=limit)
        if json_output:
            click.echo(json.dumps(results, indent=2))
            return
        table = Table(title=f"Contacts ({len(results)})")
        table.add_column("Name", style="bold")
        table.add_column("Email", style="cyan")
        table.add_column("Phone")
        table.add_column("Tags", style="dim")
        table.add_column("ID", style="dim")
        for c in results:
            name = f"{c.get('firstName', '')} {c.get('lastName', '')}".strip()
            tags = ", ".join(c.get("tags", []))
            table.add_row(name, c.get("email", ""), c.get("phone", ""), tags, c.get("id", ""))
        console.print(table)
    except Exception as e:
        console.print(f"[red]Error:[/] {e}")


@contacts.command("create")
@click.option("--first", "-f", required=True, help="First name")
@click.option("--last", "-l", required=True, help="Last name")
@click.option("--email", "-e", help="Email address")
@click.option("--phone", "-p", help="Phone number")
@click.option("--tags", "-t", multiple=True, help="Tags (repeatable)")
@click.option("--stage", "-s", type=click.Choice(PIPELINE_STAGES, case_sensitive=False),
              default="Warmed Up", help="Initial pipeline stage")
@click.option("--value", "-v", default=0, type=float, help="Deal value")
def contacts_create(first, last, email, phone, tags, stage, value):
    """Create a contact and add them to the pipeline."""
    check_api_key()
    try:
        contact = api.create_contact(first, last, email=email, phone=phone, tags=list(tags))
        contact_id = contact.get("id")
        console.print(f"[green]Created contact:[/] {first} {last} ({contact_id})")

        # Get stage ID and create opportunity
        stages = api.get_pipeline_stages()
        stage_id = None
        for s in stages:
            if s["name"].lower() == stage.lower():
                stage_id = s["id"]
                break

        if stage_id:
            opp_name = f"{first} {last} - {stage}"
            opp = api.create_opportunity(contact_id, stage_id, opp_name, value=value)
            console.print(f"[green]Added to pipeline:[/] {stage} (opp: {opp.get('id', '')})")
        else:
            console.print(f"[yellow]Warning:[/] Stage '{stage}' not found — contact created but not added to pipeline")
    except Exception as e:
        console.print(f"[red]Error:[/] {e}")


@contacts.command("get")
@click.argument("contact_id")
@click.option("--json-output", "-j", is_flag=True, help="Output as JSON")
def contacts_get(contact_id, json_output):
    """Get contact details by ID."""
    check_api_key()
    try:
        contact = api.get_contact(contact_id)
        if json_output:
            click.echo(json.dumps(contact, indent=2))
            return
        name = f"{contact.get('firstName', '')} {contact.get('lastName', '')}".strip()
        console.print(Panel(
            f"[bold]{name}[/]\n"
            f"Email: {contact.get('email', 'N/A')}\n"
            f"Phone: {contact.get('phone', 'N/A')}\n"
            f"Tags: {', '.join(contact.get('tags', []))}\n"
            f"ID: {contact.get('id', '')}",
            title="Contact"
        ))
    except Exception as e:
        console.print(f"[red]Error:[/] {e}")


@contacts.command("tag")
@click.argument("contact_id")
@click.option("--add", "-a", multiple=True, help="Tags to add")
def contacts_tag(contact_id, add):
    """Add tags to a contact."""
    check_api_key()
    try:
        result = api.add_contact_tags(contact_id, list(add))
        console.print(f"[green]Tags added:[/] {', '.join(add)}")
    except Exception as e:
        console.print(f"[red]Error:[/] {e}")


# ── Move / Advance Commands ──────────────────────────────────────────

@cli.command("move")
@click.argument("opportunity_id")
@click.argument("stage", type=click.Choice(PIPELINE_STAGES, case_sensitive=False))
def move(opportunity_id, stage):
    """Move an opportunity to a specific stage.

    Example: ghl move OPP_ID "Replying"
    """
    check_api_key()
    try:
        stages = api.get_pipeline_stages()
        stage_id = None
        for s in stages:
            if s["name"].lower() == stage.lower():
                stage_id = s["id"]
                break
        if not stage_id:
            console.print(f"[red]Stage '{stage}' not found[/]")
            return
        opp = api.move_opportunity(opportunity_id, stage_id)
        console.print(f"[green]Moved to {stage}[/] — {opp.get('name', opportunity_id)}")
    except Exception as e:
        console.print(f"[red]Error:[/] {e}")


@cli.command("advance")
@click.argument("opportunity_id")
def advance(opportunity_id):
    """Advance an opportunity to the next pipeline stage.

    Warmed Up → Replying → Meetings → Paid
    """
    check_api_key()
    try:
        stages = api.get_pipeline_stages()
        opps = api.get_opportunities(limit=100)

        # Find current opportunity
        current_opp = None
        for opp in opps:
            if opp["id"] == opportunity_id:
                current_opp = opp
                break

        if not current_opp:
            console.print(f"[red]Opportunity {opportunity_id} not found[/]")
            return

        current_stage_id = current_opp.get("pipelineStageId")

        # Find next stage
        stage_order = [s["id"] for s in stages]
        stage_names = {s["id"]: s["name"] for s in stages}
        current_idx = stage_order.index(current_stage_id) if current_stage_id in stage_order else -1

        if current_idx == -1:
            console.print("[red]Current stage not found in pipeline[/]")
            return
        if current_idx >= len(stage_order) - 1:
            console.print(f"[yellow]Already at final stage:[/] {stage_names.get(current_stage_id, 'Unknown')}")
            return

        next_stage_id = stage_order[current_idx + 1]
        opp = api.move_opportunity(opportunity_id, next_stage_id)
        console.print(
            f"[green]Advanced:[/] {stage_names[current_stage_id]} → {stage_names[next_stage_id]}"
            f" — {current_opp.get('name', opportunity_id)}"
        )
    except Exception as e:
        console.print(f"[red]Error:[/] {e}")


# ── Opportunities Commands ────────────────────────────────────────────

@cli.group("opps")
def opps():
    """List and manage opportunities in the pipeline."""
    pass


@opps.command("list")
@click.option("--stage", "-s", type=click.Choice(PIPELINE_STAGES, case_sensitive=False), help="Filter by stage")
@click.option("--limit", "-l", default=20, help="Max results")
@click.option("--json-output", "-j", is_flag=True, help="Output as JSON")
def opps_list(stage, limit, json_output):
    """List opportunities in the pipeline."""
    check_api_key()
    try:
        stages = api.get_pipeline_stages()
        stage_id = None
        stage_names = {s["id"]: s["name"] for s in stages}

        if stage:
            for s in stages:
                if s["name"].lower() == stage.lower():
                    stage_id = s["id"]
                    break

        results = api.get_opportunities(stage_id=stage_id, limit=limit)

        if json_output:
            click.echo(json.dumps(results, indent=2))
            return

        title = f"Opportunities — {stage}" if stage else "All Opportunities"
        table = Table(title=title)
        table.add_column("Name", style="bold")
        table.add_column("Stage", style="cyan")
        table.add_column("Value", style="green", justify="right")
        table.add_column("Status")
        table.add_column("ID", style="dim")

        for opp in results:
            stage_name = stage_names.get(opp.get("pipelineStageId", ""), "Unknown")
            value = f"${opp.get('monetaryValue', 0):,.0f}"
            table.add_row(
                opp.get("name", ""),
                stage_name,
                value,
                opp.get("status", ""),
                opp.get("id", ""),
            )
        console.print(table)
    except Exception as e:
        console.print(f"[red]Error:[/] {e}")


@opps.command("won")
@click.argument("opportunity_id")
@click.option("--value", "-v", type=float, help="Final deal value")
def opps_won(opportunity_id, value):
    """Mark an opportunity as won and move to Paid stage."""
    check_api_key()
    try:
        stages = api.get_pipeline_stages()
        paid_stage_id = None
        for s in stages:
            if s["name"].lower() == "paid":
                paid_stage_id = s["id"]
                break

        fields = {"status": "won", "pipelineStageId": paid_stage_id}
        if value is not None:
            fields["monetaryValue"] = value

        opp = api.update_opportunity(opportunity_id, **fields)
        console.print(f"[bold green]DEAL WON![/] {opp.get('name', opportunity_id)}")
        if value is not None:
            console.print(f"  Value: [green]${value:,.0f}[/]")
    except Exception as e:
        console.print(f"[red]Error:[/] {e}")


@opps.command("lost")
@click.argument("opportunity_id")
def opps_lost(opportunity_id):
    """Mark an opportunity as lost."""
    check_api_key()
    try:
        opp = api.update_opportunity(opportunity_id, status="lost")
        console.print(f"[red]Deal lost:[/] {opp.get('name', opportunity_id)}")
    except Exception as e:
        console.print(f"[red]Error:[/] {e}")


# ── Dashboard ─────────────────────────────────────────────────────────

@cli.command("dashboard")
def dashboard():
    """Show full pipeline dashboard with contacts at each stage."""
    check_api_key()
    try:
        stages = api.get_pipeline_stages()
        opps = api.get_opportunities(limit=100)
        stage_names = {s["id"]: s["name"] for s in stages}

        # Group opportunities by stage
        by_stage = {s["id"]: [] for s in stages}
        for opp in opps:
            sid = opp.get("pipelineStageId", "")
            if sid in by_stage:
                by_stage[sid].append(opp)

        console.print()
        console.print("[bold]Pipeline Dashboard[/]", justify="center")
        console.print(f"[dim]{GHL_PIPELINE_ID}[/]", justify="center")
        console.print()

        # Stage flow visualization
        flow_parts = []
        for stage in stages:
            sid = stage["id"]
            count = len(by_stage.get(sid, []))
            total_value = sum(o.get("monetaryValue", 0) for o in by_stage.get(sid, []))
            flow_parts.append(f"[cyan]{stage['name']}[/] ({count})")

        console.print("  " + " → ".join(flow_parts))
        console.print()

        # Detailed table per stage
        for stage in stages:
            sid = stage["id"]
            stage_opps = by_stage.get(sid, [])
            if not stage_opps:
                console.print(f"  [dim]{stage['name']}: empty[/]")
                continue

            table = Table(title=stage["name"], show_header=True, border_style="dim")
            table.add_column("Contact", style="bold")
            table.add_column("Value", style="green", justify="right")
            table.add_column("Status")
            table.add_column("Opp ID", style="dim")

            total = 0
            for opp in stage_opps:
                val = opp.get("monetaryValue", 0)
                total += val
                table.add_row(
                    opp.get("name", ""),
                    f"${val:,.0f}",
                    opp.get("status", "open"),
                    opp.get("id", ""),
                )

            table.add_row("[bold]Total[/]", f"[bold green]${total:,.0f}[/]", "", "")
            console.print(table)
            console.print()

        # Summary
        total_opps = len(opps)
        total_value = sum(o.get("monetaryValue", 0) for o in opps)
        won = [o for o in opps if o.get("status") == "won"]
        console.print(Panel(
            f"Total opportunities: [bold]{total_opps}[/]\n"
            f"Total pipeline value: [bold green]${total_value:,.0f}[/]\n"
            f"Deals won: [bold green]{len(won)}[/]",
            title="Summary"
        ))
    except Exception as e:
        console.print(f"[red]Error:[/] {e}")


# ── Entry Point ───────────────────────────────────────────────────────

if __name__ == "__main__":
    cli()

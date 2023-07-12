import { Category } from '@discordx/utilities'
import {
    ActionRowBuilder,
    ApplicationCommandOptionType,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    ChannelType,
    CommandInteraction,
    Embed,
    EmbedBuilder,
    ModalBuilder,
    ModalSubmitInteraction,
    TextInputBuilder,
    TextInputStyle,
} from 'discord.js'
import { ButtonComponent, Client, SlashOption } from 'discordx'
import { Guard, UserPermissions } from '@guards'
import { Discord, Slash } from '@decorators'
import { Database } from '@services'
import { Guild } from '@entities'
import { injectable } from 'tsyringe'

@Discord()
@injectable()
@Category('General')
export default class NickReqCommand {
    constructor(private db: Database) {}

    extractField(embed: Embed) {
        const { fields } = embed
        if (!fields.length) return null
        const reqId = fields.find((f) => f.name === 'ID')?.['value']
        const reqNewNick = fields.find((f) => f.name === 'New')?.['value']
        const reqOldNick = fields.find((f) => f.name === 'Old')?.['value']

        return {
            reqId,
            reqNewNick,
            reqOldNick,
        }
    }

    @ButtonComponent({ id: 'nick-a' })
    @Guard(UserPermissions(['ManageNicknames']))
    async acceptHandler(interaction: ButtonInteraction): Promise<void> {
        const { guild, message, member, client } = interaction
        if (!guild) return

        const reqEmbed = message.embeds.shift()
        if (!reqEmbed) return

        const fields = this.extractField(reqEmbed)
        if (!fields) return

        const reqMember = await guild.members.fetch(fields.reqId || '')

        reqMember
            .setNickname(fields.reqNewNick || null)
            .then((m) => {
                m.send({
                    content: `✅ ${member?.user.username} đã chấp nhận yêu cầu đổi tên của bạn.`,
                })

                const accecpt_embed = new EmbedBuilder()
                    .setTitle(`Nickname Request Approved (${fields.reqId})`)
                    .setColor('Green')
                    .addFields([
                        {
                            name: `Changed for`,
                            value: reqMember.user.tag,
                        },
                        {
                            name: `From`,
                            value: fields.reqOldNick || '',
                        },
                        {
                            name: `To`,
                            value: fields.reqNewNick || '',
                        },
                    ])
                    .setFooter({
                        text: `Approved by ${interaction.user.tag}`,
                    })

                interaction.update({
                    embeds: [accecpt_embed],
                    components: [],
                })
            })
            .catch((error) => {
                interaction.reply({
                    content: `\`\`\`${error}\`\`\``,
                    ephemeral: true,
                })
            })
    }

    @ButtonComponent({ id: 'nick-d' })
    @Guard(UserPermissions(['ManageNicknames']))
    async declineHandler(interaction: ButtonInteraction): Promise<void> {
        const { guild, message, member, client } = interaction
        if (!guild) return

        const reqEmbed = message.embeds.shift()
        if (!reqEmbed) return

        const fields = this.extractField(reqEmbed)
        if (!fields) return

        const reqDecReasonInput = new TextInputBuilder()
            .setCustomId('reason')
            // The label is the prompt the user sees for this input
            .setLabel('Lý do từ chối')
            // Short means only a single line of text
            .setStyle(TextInputStyle.Paragraph)

        const reqDecReasonRow =
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                reqDecReasonInput
            )

        const modal = new ModalBuilder()
            .setCustomId('nick-r')
            .setTitle('Nickname Decline Reason')
            .addComponents(reqDecReasonRow)

        await interaction.showModal(modal)

        const filter = (i: ModalSubmitInteraction) =>
            i.customId === 'nick-r' && i.user.id === interaction.user.id

        interaction
            .awaitModalSubmit({ filter, time: 300_000 })
            .then(async (replyInteraction: ModalSubmitInteraction) => {
                if (!interaction.guild) return
                const reqMem = await interaction.guild.members.fetch(
                    fields.reqId || ''
                )
                const reason =
                    replyInteraction.fields.getTextInputValue('reason')

                const decline_embed = new EmbedBuilder()
                    .setTitle(`Nickname Request Declined (${fields.reqId})`)
                    .setColor('Red')
                    .addFields([
                        {
                            name: `Changed for`,
                            value: reqMem.user.tag,
                        },
                        {
                            name: `From`,
                            value: fields.reqOldNick || '',
                        },
                        {
                            name: `To`,
                            value: fields.reqNewNick || '',
                        },
                        {
                            name: 'Reason',
                            value: reason.length == 0 ? 'None' : reason,
                        },
                    ])
                    .setFooter({
                        text: `Declined by ${replyInteraction.user.tag}`,
                    })

                //@ts-ignore
                replyInteraction.update({
                    embeds: [decline_embed],
                    components: [],
                })

                reqMem
                    .send({
                        content: `❌ ${
                            member?.user.username
                        } đã từ chối yêu cầu đổi tên của bạn.${
                            reason.length == 0
                                ? ''
                                : `\n**Lý do**: \`\`\`${reason}\`\`\``
                        }`,
                    })
                    .catch((e) => {
                        if (e.message)
                            replyInteraction.followUp({
                                content: `${e.message}`,
                                ephemeral: true,
                            })

                        console.error('[Nick Decline User DM]', e)
                    })
            })
            .catch((error) => {
                if (error.message)
                    interaction.followUp({
                        content: `${error.message}`,
                        ephemeral: true,
                    })
                console.error('[Nick Decline]', error)
            })
    }

    @Slash({
        name: 'nickname',
        description: 'Send a request to change your nickname',
    })
    async sendNicknameReq(
        @SlashOption({
            description: 'Your wish new nickname',
            name: 'new_nick',
            required: true,
            type: ApplicationCommandOptionType.String,
        })
        new_nick: string,
        interaction: CommandInteraction,
        client: Client,
        { localize }: InteractionData
    ) {
        const { guild } = interaction

        if (!guild || !interaction.member) {
            interaction.followUp({
                content: `Error`,
                ephemeral: true,
            })
            return
        }

        const guildData = await this.db.get(Guild).findOne({
            id: guild.id || '',
        })

        if (!guildData || !guildData.nickname_channel_id) {
            interaction.followUp({
                content: `Error`,
                ephemeral: true,
            })
            return
        }

        const nickReqChannel = await guild.channels.fetch(
            guildData.nickname_channel_id
        )

        if (!nickReqChannel || nickReqChannel.type !== ChannelType.GuildText) {
            interaction.followUp({
                content: `Error`,
                ephemeral: true,
            })
            return
        }

        const member = await guild.members.fetch(interaction.member.user.id)

        const embed = new EmbedBuilder()
            .setAuthor({
                name: member.user.tag,
                iconURL: member.displayAvatarURL(),
            })
            .setTitle('Nickname Request')
            .setColor('Random')
            .addFields([
                {
                    name: 'ID',
                    value: interaction.user.id,
                },
                {
                    name: 'Old',
                    value: member.displayName,
                },
                {
                    name: 'New',
                    value: new_nick,
                },
            ])

        const components = (state: boolean) => [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId('nick-a')
                    .setDisabled(state)
                    .setLabel('Approve')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('nick-d')
                    .setDisabled(state)
                    .setLabel('Decline')
                    .setStyle(ButtonStyle.Danger)
            ),
        ]

        nickReqChannel.send({
            embeds: [embed],
            components: components(false),
        })

        interaction.followUp({
            content: `Yêu cầu của bạn đã được gửi đi! Vui lòng đợi các QTV duyệt!`,
            ephemeral: true,
        })
    }
}